import {
  APICallError,
  NoSuchModelError,
  TypeValidationError,
  generateText,
  jsonSchema,
  tool,
  type JSONSchema7,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import { Injectable, Logger } from '@nestjs/common';
import type { LlamadaHerramienta, MensajeLlm, UsoReportado } from '../dominio/tipos-llm.js';
import type { SolicitudGeneracion } from '../puertos/llm-port.js';
import {
  AdaptadorLlmError,
  type LimiteIntento,
  type ResultadoAdaptador,
} from '../puertos/adaptador-llm.js';

type ProviderOptions = NonNullable<
  Extract<ModelMessage, { role: 'assistant' }>['providerOptions']
>;

/** Uso tal como lo normaliza el AI SDK, base común de cada `normalizarUso` (D8). */
export interface UsoSdk {
  readonly inputTokens: number | undefined;
  readonly outputTokens: number | undefined;
  readonly inputTokenDetails: { readonly cacheReadTokens: number | undefined };
}

/**
 * Lo único propio de un proveedor (D3 de `proveedores-llm-configurables`): cómo crear su modelo del
 * AI SDK y cómo leer su uso y su caché. Cada implementación vive en su archivo de `proveedores/` e
 * importa solo su SDK; el mapeo y la clasificación de errores son del adaptador genérico (LLM20).
 */
export interface ProveedorLlm {
  readonly nombre: string;
  crearModelo(modelo: string): LanguageModel;
  /** LLM18: `tokensEntrada` sin los tokens servidos desde caché; `tokensCache` 0 si no se informa. */
  normalizarUso(usoSdk: UsoSdk, metadatos: unknown): UsoReportado;
}

const ERROR_ABORTO = 'AbortError';

/** `true` si el valor es un objeto plano indexable; los metadatos del proveedor llegan como `unknown`. */
export function esRegistro(valor: unknown): valor is Record<string, unknown> {
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

/**
 * Único archivo que importa `ai` (ADR-0002, LLM11, LLM20). Hace exactamente un intento contra el
 * proveedor que recibe y propaga el error clasificado: el reintento, el fallback y el circuito son
 * del gateway. Transporta definiciones, llamadas y metadatos sin interpretarlos. No guarda estado
 * por proveedor: cada llamada trae el suyo.
 */
@Injectable()
export class AdaptadorAiSdk {
  private readonly logger = new Logger(AdaptadorAiSdk.name);

  async generarConModelo(
    proveedor: ProveedorLlm,
    modelo: string,
    solicitud: SolicitudGeneracion,
    limite: LimiteIntento,
  ): Promise<ResultadoAdaptador> {
    try {
      const resultado = await generateText({
        model: proveedor.crearModelo(modelo),
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
      const uso = proveedor.normalizarUso(resultado.usage, resultado.providerMetadata);
      // R2: el `cost` del proveedor solo se deja como referencia en el log; nunca decide el techo.
      this.logger.debug({ evento: 'llm.respuesta', proveedor: proveedor.nombre, modelo, tokens: uso });
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

  private clasificar(error: unknown, abort: AbortSignal): unknown {
    if (abort.aborted || (error instanceof Error && error.name === ERROR_ABORTO)) {
      return new AdaptadorLlmError('reintentable', 'timeout');
    }
    if (APICallError.isInstance(error)) {
      const estado = error.statusCode;
      if (estado === undefined) {
        return new AdaptadorLlmError('reintentable', 'sin-respuesta');
      }
      // 408 (el proveedor agotó su propia espera) es transitorio como un 429 o un 5xx.
      const reintentable = estado === 408 || estado === 429 || estado >= 500;
      return new AdaptadorLlmError(reintentable ? 'reintentable' : 'no-reintentable', 'http', estado);
    }
    if (TypeValidationError.isInstance(error) || NoSuchModelError.isInstance(error)) {
      return new AdaptadorLlmError('no-reintentable', 'http');
    }
    // Un error que no sabemos clasificar sube tal cual: el gateway lo trata como no reintentable.
    return error;
  }
}
