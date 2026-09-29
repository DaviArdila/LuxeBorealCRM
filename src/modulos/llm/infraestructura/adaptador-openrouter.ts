import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import {
  APICallError,
  NoSuchModelError,
  TypeValidationError,
  generateText,
  jsonSchema,
  tool,
  type JSONSchema7,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../../plataforma/config/index.js';
import type { LlamadaHerramienta, MensajeLlm, UsoReportado } from '../dominio/tipos-llm.js';
import type { SolicitudGeneracion } from '../puertos/llm-port.js';
import {
  AdaptadorLlmError,
  type AdaptadorLlm,
  type LimiteIntento,
  type ResultadoAdaptador,
} from '../puertos/adaptador-llm.js';

type ConfigAdaptadorOpenRouter = Pick<Configuracion, 'OPENROUTER_API_KEY' | 'OPENROUTER_BASE_URL'>;

type ProviderOptions = NonNullable<
  Extract<ModelMessage, { role: 'assistant' }>['providerOptions']
>;

const ERROR_ABORTO = 'AbortError';

function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

// Los metadatos que el proveedor devolvió en una llamada de herramienta vuelven idénticos al
// proveedor en el turno siguiente (B7); el adaptador no lee su contenido.
function opcionesDeProveedor(metadatos: unknown): ProviderOptions | undefined {
  return esRegistro(metadatos) ? (metadatos as ProviderOptions) : undefined;
}

function aMensajesSdk(mensajes: readonly MensajeLlm[]): ModelMessage[] {
  return mensajes.map((mensaje): ModelMessage => {
    if (mensaje.resultadosHerramienta !== undefined) {
      return {
        role: 'tool',
        content: mensaje.resultadosHerramienta.map((resultado) => ({
          type: 'tool-result',
          toolCallId: resultado.idLlamada,
          toolName: resultado.nombre,
          output: {
            type: resultado.esError ? 'error-json' : 'json',
            value: (resultado.resultado ?? null) as never,
          },
        })),
      };
    }
    if (mensaje.rol === 'usuario') {
      return { role: 'user', content: mensaje.texto ?? '' };
    }
    return {
      role: 'assistant',
      content: [
        ...(mensaje.texto === undefined ? [] : [{ type: 'text' as const, text: mensaje.texto }]),
        ...(mensaje.llamadasHerramienta ?? []).map((llamada) => ({
          type: 'tool-call' as const,
          toolCallId: llamada.id,
          toolName: llamada.nombre,
          input: llamada.argumentos,
          providerOptions: opcionesDeProveedor(llamada.metadatosProveedor),
        })),
      ],
    };
  });
}

function aHerramientasSdk(solicitud: SolicitudGeneracion): ToolSet | undefined {
  if (solicitud.herramientas === undefined || solicitud.herramientas.length === 0) {
    return undefined;
  }
  // Solo el JSON Schema viaja al proveedor: la validación de los argumentos es del gateway (D13).
  return Object.fromEntries(
    solicitud.herramientas.map((definicion) => [
      definicion.nombre,
      tool({
        description: definicion.descripcion,
        inputSchema: jsonSchema(definicion.esquemaJson as JSONSchema7),
      }),
    ]),
  );
}

function tokensDeCacheReportados(metadatos: unknown, respaldo: number | undefined): number {
  const uso = esRegistro(metadatos) && esRegistro(metadatos['openrouter'])
    ? metadatos['openrouter']['usage']
    : undefined;
  const detalle = esRegistro(uso) ? uso['promptTokensDetails'] : undefined;
  const cacheado = esRegistro(detalle) ? detalle['cachedTokens'] : undefined;
  return typeof cacheado === 'number' ? cacheado : (respaldo ?? 0);
}

/**
 * Único archivo que importa `ai` y `@openrouter/ai-sdk-provider` (ADR-0002, LLM11). Hace exactamente
 * un intento contra OpenRouter y propaga el error clasificado: el reintento, el fallback y el
 * circuito son del gateway. Transporta definiciones, llamadas y metadatos sin interpretarlos.
 */
@Injectable()
export class AdaptadorOpenRouter implements AdaptadorLlm {
  private readonly logger = new Logger(AdaptadorOpenRouter.name);
  private readonly openrouter: ReturnType<typeof createOpenRouter>;

  constructor(@Inject(CONFIGURACION) configuracion: ConfigAdaptadorOpenRouter) {
    this.openrouter = createOpenRouter({
      apiKey: configuracion.OPENROUTER_API_KEY,
      baseURL: configuracion.OPENROUTER_BASE_URL,
    });
  }

  async generarConModelo(
    modelo: string,
    solicitud: SolicitudGeneracion,
    limite: LimiteIntento,
  ): Promise<ResultadoAdaptador> {
    try {
      const resultado = await generateText({
        model: this.openrouter(modelo, { usage: { include: true } }),
        system: solicitud.systemPrompt,
        messages: aMensajesSdk(solicitud.mensajes),
        tools: aHerramientasSdk(solicitud),
        maxOutputTokens: limite.maxTokens,
        abortSignal: limite.abort,
        // El AI SDK reintenta 2 veces por defecto: aquí el gateway es el único que reintenta.
        maxRetries: 0,
      });

      const llamadas: LlamadaHerramienta[] = resultado.toolCalls.map((llamada) => ({
        id: llamada.toolCallId,
        nombre: llamada.toolName,
        argumentos: llamada.input as unknown,
        ...(llamada.providerMetadata === undefined
          ? {}
          : { metadatosProveedor: llamada.providerMetadata }),
      }));
      const uso = this.aUso(resultado.usage, resultado.providerMetadata);
      // R2: el `cost` del proveedor solo se deja como referencia en el log; nunca decide el techo.
      this.logger.debug({ evento: 'llm.respuesta', modelo, tokens: uso });
      return {
        texto: resultado.text,
        llamadas,
        uso,
        metadatos: resultado.providerMetadata,
      };
    } catch (error) {
      throw this.clasificar(error, limite.abort);
    }
  }

  // `prompt_tokens` de OpenRouter incluye los tokens servidos desde caché: se separan para que el
  // costo estimado (D6) cobre cada grupo con su precio.
  private aUso(
    usoSdk: { inputTokens: number | undefined; outputTokens: number | undefined; inputTokenDetails: { cacheReadTokens: number | undefined } },
    metadatos: unknown,
  ): UsoReportado {
    const tokensCache = tokensDeCacheReportados(metadatos, usoSdk.inputTokenDetails.cacheReadTokens);
    return {
      tokensEntrada: Math.max(0, (usoSdk.inputTokens ?? 0) - tokensCache),
      tokensSalida: usoSdk.outputTokens ?? 0,
      tokensCache,
    };
  }

  private clasificar(error: unknown, abort: AbortSignal): unknown {
    if (abort.aborted || (error instanceof Error && error.name === ERROR_ABORTO)) {
      return new AdaptadorLlmError('reintentable', 'timeout');
    }
    if (APICallError.isInstance(error)) {
      const estado = error.statusCode;
      if (estado === undefined) {
        return new AdaptadorLlmError('reintentable', 'sin-respuesta');
      }
      const reintentable = estado === 429 || estado >= 500;
      return new AdaptadorLlmError(reintentable ? 'reintentable' : 'no-reintentable', 'http', estado);
    }
    if (TypeValidationError.isInstance(error) || NoSuchModelError.isInstance(error)) {
      return new AdaptadorLlmError('no-reintentable', 'http');
    }
    // Un error que no sabemos clasificar sube tal cual: el gateway lo trata como no reintentable.
    return error;
  }
}
