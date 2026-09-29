import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIGURACION } from '../../../plataforma/config/index.js';
import { CLOCK, type Clock } from '../../../plataforma/reloj/index.js';
import { calcularCostoEstimado, microUsdAUsd } from '../dominio/calcular-costo.js';
import { ErrorPasarelaLlm } from '../dominio/error-pasarela-llm.js';
import type {
  PerfilLlm,
  RespuestaGeneracion,
  SolicitudGeneracion,
  UsoReportado,
} from '../dominio/tipos-llm.js';
import { validarLlamadasHerramienta } from '../dominio/validar-llamadas.js';
import {
  ADAPTADOR_LLM,
  AdaptadorLlmError,
  type AdaptadorLlm,
  type ResultadoAdaptador,
} from '../puertos/adaptador-llm.js';
import type { LlmPort } from '../puertos/llm-port.js';
import {
  REPOSITORIO_USO_LLM,
  type FilaUsoLlm,
  type RepositorioUsoLlm,
} from '../puertos/repositorio-uso-llm.js';
import { TEMPORIZADOR_LLM, type TemporizadorLlm } from '../puertos/temporizador-llm.js';
import type { ConfigGatewayLlm } from './config-gateway-llm.js';

const PROVEEDOR = 'openrouter';
// D3: el presupuesto total deja 5 s del lock de turno para el INSERT en `uso_llm` y la liberación.
const MARGEN_DEL_LOCK_MS = 5_000;
// D3: con 2 s o menos de presupuesto no vale la pena lanzar otro intento.
const RESTANTE_MINIMO_PARA_REINTENTAR_MS = 2_000;
// D4: jitter uniforme 0-200 ms sobre el backoff exponencial.
const JITTER_MAXIMO_MS = 200;

interface ConfigPerfil {
  readonly modelos: readonly string[];
  readonly timeoutMs: number;
  readonly maxTokens: number;
  readonly maxReintentos: number;
}

type SalidaIntento =
  | { readonly ok: true; readonly resultado: ResultadoAdaptador }
  | { readonly ok: false; readonly error: AdaptadorLlmError };

function rechazarAlAbortar(senal: AbortSignal): Promise<never> {
  return new Promise((_, rechazar) => {
    senal.addEventListener(
      'abort',
      () => {
        rechazar(new AdaptadorLlmError('reintentable', 'timeout'));
      },
      { once: true },
    );
  });
}

/**
 * Gateway de LLM (D2-D4): único dueño de la resiliencia. Aplica el timeout del perfil, el presupuesto
 * total derivado del lock del turno y el reintento acotado con backoff, y deja una fila en
 * `uso_llm` por cada intento contra el proveedor. Los adaptadores hacen un intento y propagan.
 */
@Injectable()
export class LlmGateway implements LlmPort {
  private readonly logger = new Logger(LlmGateway.name);

  constructor(
    @Inject(ADAPTADOR_LLM) private readonly adaptador: AdaptadorLlm,
    @Inject(REPOSITORIO_USO_LLM) private readonly repositorioUso: RepositorioUsoLlm,
    @Inject(TEMPORIZADOR_LLM) private readonly temporizador: TemporizadorLlm,
    @Inject(CONFIGURACION) private readonly configuracion: ConfigGatewayLlm,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async generar(solicitud: SolicitudGeneracion): Promise<RespuestaGeneracion> {
    const perfil = this.perfil(solicitud.perfil);
    const modelo = perfil.modelos[0];
    const inicio = this.clock.ahora().getTime();
    const presupuestoMs = this.configuracion.LOCK_TURNO_TTL_S * 1000 - MARGEN_DEL_LOCK_MS;
    const restanteMs = () => presupuestoMs - (this.clock.ahora().getTime() - inicio);

    for (let reintentos = 0; ; reintentos += 1) {
      const timeoutMs = Math.min(perfil.timeoutMs, restanteMs());
      const salida = await this.intentar(modelo, solicitud, perfil.maxTokens, timeoutMs);
      if (salida.ok) {
        return this.aRespuesta(salida.resultado, solicitud);
      }

      const sinReintentos =
        salida.error.clase === 'no-reintentable' ||
        reintentos >= perfil.maxReintentos ||
        restanteMs() <= RESTANTE_MINIMO_PARA_REINTENTAR_MS;
      if (sinReintentos) {
        throw this.aErrorPasarela(salida.error, modelo, reintentos + 1);
      }
      await this.temporizador.esperar(this.backoffMs(reintentos));
    }
  }

  private perfil(perfil: PerfilLlm): ConfigPerfil {
    const c = this.configuracion;
    return perfil === 'conversacion'
      ? {
          modelos: c.LLM_CONVERSACION_MODELOS,
          timeoutMs: c.LLM_CONVERSACION_TIMEOUT_MS,
          maxTokens: c.LLM_CONVERSACION_MAX_TOKENS,
          maxReintentos: c.LLM_CONVERSACION_MAX_REINTENTOS,
        }
      : {
          modelos: c.LLM_EVALS_MODELOS,
          timeoutMs: c.LLM_EVALS_TIMEOUT_MS,
          maxTokens: c.LLM_EVALS_MAX_TOKENS,
          maxReintentos: c.LLM_EVALS_MAX_REINTENTOS,
        };
  }

  // Un intento contra el proveedor con su timeout. El gateway impone el aborto aunque el adaptador
  // ignore la señal (LLM3) y siempre deja la fila de uso (LLM6).
  private async intentar(
    modelo: string,
    solicitud: SolicitudGeneracion,
    maxTokens: number,
    timeoutMs: number,
  ): Promise<SalidaIntento> {
    const inicio = this.clock.ahora().getTime();
    const controlador = new AbortController();
    const cancelarAborto = this.temporizador.programar(timeoutMs, () => {
      controlador.abort();
    });

    let salida: SalidaIntento;
    try {
      const resultado = await Promise.race([
        this.adaptador.generarConModelo(modelo, solicitud, { maxTokens, abort: controlador.signal }),
        rechazarAlAbortar(controlador.signal),
      ]);
      salida = { ok: true, resultado };
    } catch (error) {
      salida = { ok: false, error: this.clasificar(error, modelo) };
    } finally {
      cancelarAborto();
    }

    const latenciaMs = this.clock.ahora().getTime() - inicio;
    await this.repositorioUso.registrarUso(this.aFila(modelo, solicitud, latenciaMs, salida));
    return salida;
  }

  private clasificar(error: unknown, modelo: string): AdaptadorLlmError {
    if (error instanceof AdaptadorLlmError) {
      return error;
    }
    // Solo se loguea el modelo: el mensaje de un error inesperado podría traer contenido (R14).
    this.logger.warn({ evento: 'llm.error-no-clasificado', modelo });
    return new AdaptadorLlmError('no-reintentable', 'http');
  }

  private backoffMs(reintentosHechos: number): number {
    const exponencial = this.configuracion.LLM_REINTENTO_BASE_MS * 2 ** reintentosHechos;
    // El azar y su rango viven en el temporizador para que los tests no dependan de `Math.random`.
    const conJitter = exponencial + this.temporizador.azar() * JITTER_MAXIMO_MS;
    return Math.min(conJitter, this.configuracion.LLM_REINTENTO_MAX_MS);
  }

  private aErrorPasarela(error: AdaptadorLlmError, modelo: string, intentos: number): ErrorPasarelaLlm {
    const codigo =
      error.clase === 'no-reintentable'
        ? 'no-reintentable'
        : error.causa === 'timeout'
          ? 'timeout'
          : 'proveedor-caido';
    this.logger.warn({ evento: 'llm.fallo', codigo, modelo, intentos });
    return new ErrorPasarelaLlm(codigo, modelo);
  }

  private aFila(
    modelo: string,
    solicitud: SolicitudGeneracion,
    latenciaMs: number,
    salida: SalidaIntento,
  ): FilaUsoLlm {
    const uso: UsoReportado = salida.ok
      ? salida.resultado.uso
      : { tokensEntrada: 0, tokensSalida: 0, tokensCache: 0 };
    return {
      proveedor: PROVEEDOR,
      modelo,
      tokensEntrada: uso.tokensEntrada,
      tokensSalida: uso.tokensSalida,
      tokensCache: uso.tokensCache,
      costoEstimadoUsd: salida.ok ? this.costoUsd(modelo, uso) : 0,
      latenciaMs,
      exito: salida.ok,
      conversacionId: solicitud.conversacionId,
    };
  }

  // R2: el costo sale de la tabla de precios de configuración, nunca del LLM ni del proveedor.
  private costoUsd(modelo: string, uso: UsoReportado): number {
    const precio = this.configuracion.LLM_PRECIOS_USD_JSON[modelo];
    if (precio === undefined) {
      this.logger.warn({ evento: 'llm.precio-desconocido', modelo });
      return 0;
    }
    return microUsdAUsd(calcularCostoEstimado(uso, precio));
  }

  private aRespuesta(
    resultado: ResultadoAdaptador,
    solicitud: SolicitudGeneracion,
  ): RespuestaGeneracion {
    const { validas, invalidas } = validarLlamadasHerramienta(
      resultado.llamadas ?? [],
      solicitud.herramientas ?? [],
    );
    return {
      texto: resultado.texto,
      llamadasHerramienta: resultado.llamadas === undefined ? undefined : validas,
      llamadasInvalidas: invalidas.length > 0 ? invalidas : undefined,
      uso: resultado.uso,
      metadatosProveedor: resultado.metadatos,
    };
  }
}
