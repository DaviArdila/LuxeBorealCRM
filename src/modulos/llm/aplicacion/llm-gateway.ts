import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CONFIGURACION } from '../../../plataforma/config/index.js';
import { CLOCK, type Clock } from '../../../plataforma/reloj/index.js';
import { calcularCostoEstimado, inicioMesUTC, microUsdAUsd } from '../dominio/calcular-costo.js';
import {
  ErrorPasarelaLlm,
  type CodigoErrorPasarela,
} from '../dominio/error-pasarela-llm.js';
import {
  CIRCUITO_INICIAL,
  debeLlamar,
  registrarExito,
  registrarFallo,
  type ConfigCircuito,
  type EstadoCircuito,
} from '../dominio/estado-circuito.js';
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
  REPOSITORIO_PARAMETRO_LLM,
  type RepositorioParametroLlm,
} from '../puertos/repositorio-parametro-llm.js';
import {
  REPOSITORIO_USO_LLM,
  type FilaUsoLlm,
  type RepositorioUsoLlm,
} from '../puertos/repositorio-uso-llm.js';
import { TEMPORIZADOR_LLM, type TemporizadorLlm } from '../puertos/temporizador-llm.js';
import { ULTIMO_RECURSO_LLM, type UltimoRecursoLlm } from '../puertos/ultimo-recurso-llm.js';
import type { ConfigGatewayLlm } from './config-gateway-llm.js';

const PROVEEDOR = 'openrouter';
// Las filas de intentos que nunca llegaron al proveedor (D9) usan este pseudo-proveedor.
const PROVEEDOR_PASARELA = 'pasarela';
const MODELO_CIRCUITO_ABIERTO = 'circuito-abierto';
const MODELO_TECHO_ALCANZADO = 'techo-alcanzado';
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

type SalidaModelo =
  | { readonly tipo: 'ok'; readonly resultado: ResultadoAdaptador }
  | { readonly tipo: 'fallo'; readonly error: AdaptadorLlmError }
  | { readonly tipo: 'circuito-abierto' };

interface FalloDeModelo {
  readonly modelo: string;
  readonly codigo: CodigoErrorPasarela;
}

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

function codigoDeError(error: AdaptadorLlmError): CodigoErrorPasarela {
  if (error.clase === 'no-reintentable') {
    return 'no-reintentable';
  }
  return error.causa === 'timeout' ? 'timeout' : 'proveedor-caido';
}

/**
 * Gateway de LLM (D2-D5): único dueño de la resiliencia. Recorre los modelos del perfil en orden
 * (ADR-0014), aplica el timeout del perfil, el presupuesto total derivado del lock del turno, el
 * reintento acotado con backoff y un circuit breaker por modelo en memoria (ADR-0013), y deja una
 * fila en `uso_llm` por cada intento. Los adaptadores hacen un intento y propagan.
 */
@Injectable()
export class LlmGateway implements LlmPort {
  private readonly logger = new Logger(LlmGateway.name);
  private readonly circuitos = new Map<string, EstadoCircuito>();

  constructor(
    @Inject(ADAPTADOR_LLM) private readonly adaptador: AdaptadorLlm,
    @Inject(REPOSITORIO_USO_LLM) private readonly repositorioUso: RepositorioUsoLlm,
    @Inject(REPOSITORIO_PARAMETRO_LLM) private readonly repositorioParametro: RepositorioParametroLlm,
    @Inject(TEMPORIZADOR_LLM) private readonly temporizador: TemporizadorLlm,
    @Inject(CONFIGURACION) private readonly configuracion: ConfigGatewayLlm,
    @Inject(CLOCK) private readonly clock: Clock,
    @Optional() @Inject(ULTIMO_RECURSO_LLM) private readonly ultimoRecurso?: UltimoRecursoLlm,
  ) {}

  async generar(solicitud: SolicitudGeneracion): Promise<RespuestaGeneracion> {
    await this.verificarTecho(solicitud);
    const perfil = this.perfil(solicitud.perfil);
    const inicio = this.clock.ahora().getTime();
    const presupuestoMs = this.configuracion.LOCK_TURNO_TTL_S * 1000 - MARGEN_DEL_LOCK_MS;
    const restanteMs = () => presupuestoMs - (this.clock.ahora().getTime() - inicio);

    const fallos: FalloDeModelo[] = [];
    for (const modelo of perfil.modelos) {
      if (fallos.length > 0 && restanteMs() <= RESTANTE_MINIMO_PARA_REINTENTAR_MS) {
        break;
      }
      const salida = await this.probarModelo(modelo, solicitud, perfil, restanteMs);
      if (salida.tipo === 'ok') {
        return this.aRespuesta(salida.resultado, solicitud);
      }
      if (salida.tipo === 'fallo') {
        fallos.push({ modelo, codigo: codigoDeError(salida.error) });
      }
    }

    const error = this.errorFinal(fallos);
    this.logger.warn({ evento: 'llm.fallo', codigo: error.codigo, modelosProbados: fallos.length });
    if (error.codigo === 'proveedor-caido' && this.ultimoRecurso !== undefined) {
      return this.ultimoRecurso.generar(solicitud);
    }
    throw error;
  }

  // D7/D9: un agregado del mes por llamada (sin caché: una caché vieja deja gastar de más) y, solo al
  // cruzar el umbral, el estado durable del techo. En `test` el techo no aplica (LLM7).
  private async verificarTecho(solicitud: SolicitudGeneracion): Promise<void> {
    const c = this.configuracion;
    if (c.NODE_ENV === 'test') {
      return;
    }
    const desde = inicioMesUTC(this.clock.ahora());
    let gastoUsd: number;
    try {
      gastoUsd = await this.repositorioUso.gastoMensual(desde);
    } catch (error) {
      // Si no se puede medir el gasto no se bloquea al cliente por un fallo de contabilidad.
      this.logger.error({ evento: 'llm.techo-no-verificado', error: this.nombreDe(error) });
      return;
    }

    const techoUsd = c.LLM_TECHO_MENSUAL_USD;
    if (gastoUsd < (techoUsd * c.LLM_UMBRAL_AVISO_PCT) / 100) {
      return;
    }
    const bloquea = gastoUsd >= techoUsd;
    await this.actualizarEstadoDelTecho(desde.toISOString().slice(0, 7), gastoUsd, techoUsd, bloquea);
    if (bloquea) {
      await this.registrarFilaDePasarela(MODELO_TECHO_ALCANZADO, solicitud);
      throw new ErrorPasarelaLlm('techo-alcanzado');
    }
  }

  // El aviso sale una vez por mes y el estado queda en `parametro` para sobrevivir a un reinicio.
  private async actualizarEstadoDelTecho(
    mes: string,
    gastoUsd: number,
    techoUsd: number,
    bloquea: boolean,
  ): Promise<void> {
    try {
      const previo = await this.repositorioParametro.leerEstadoTecho();
      const estado = previo?.mes === mes ? previo : null;
      const avisar = estado === null || !estado.avisoEmitido;
      if (avisar) {
        this.logger.warn({ evento: 'llm.techo-aviso', mes, gastoUsd, techoUsd });
      }
      const yaBloqueado = estado?.bloqueado ?? false;
      if (avisar || (bloquea && !yaBloqueado)) {
        await this.repositorioParametro.guardarEstadoTecho({
          mes,
          gastoUsd,
          techoUsd,
          avisoEmitido: true,
          bloqueado: bloquea || yaBloqueado,
        });
      }
    } catch (error) {
      this.logger.error({ evento: 'llm.techo-estado-no-guardado', error: this.nombreDe(error) });
    }
  }

  // R14: de un error solo se loguea su tipo; el mensaje puede traer valores de la fila.
  private nombreDe(error: unknown): string {
    return error instanceof Error ? error.name : 'desconocido';
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

  // Los reintentos (D4) son por modelo: un 429 transitorio del primero no gasta los del segundo.
  private async probarModelo(
    modelo: string,
    solicitud: SolicitudGeneracion,
    perfil: ConfigPerfil,
    restanteMs: () => number,
  ): Promise<SalidaModelo> {
    let ultimoError: AdaptadorLlmError | undefined;
    for (let reintentos = 0; ; reintentos += 1) {
      if (!this.circuitoPermite(modelo)) {
        if (ultimoError !== undefined) {
          return { tipo: 'fallo', error: ultimoError };
        }
        this.logger.warn({ evento: 'llm.circuito-bloquea', modelo });
        await this.registrarFilaDePasarela(MODELO_CIRCUITO_ABIERTO, solicitud);
        return { tipo: 'circuito-abierto' };
      }

      const timeoutMs = Math.min(perfil.timeoutMs, restanteMs());
      const salida = await this.intentar(modelo, solicitud, perfil.maxTokens, timeoutMs);
      if (salida.ok) {
        this.circuitos.set(modelo, registrarExito());
        return { tipo: 'ok', resultado: salida.resultado };
      }

      ultimoError = salida.error;
      // Un 4xx no reintentable no es un fallo del proveedor: no cuenta para el circuito (D5).
      if (ultimoError.clase === 'reintentable') {
        this.registrarFalloDeCircuito(modelo);
      } else if (this.circuitos.get(modelo)?.fase === 'semiabierto') {
        // La sonda obtuvo respuesta del proveedor (un 4xx): sin resolverla el circuito quedaría
        // semiabierto para siempre.
        this.circuitos.set(modelo, registrarExito());
      }
      const sinReintentos =
        ultimoError.clase === 'no-reintentable' ||
        reintentos >= perfil.maxReintentos ||
        restanteMs() <= RESTANTE_MINIMO_PARA_REINTENTAR_MS;
      if (sinReintentos) {
        return { tipo: 'fallo', error: ultimoError };
      }
      await this.temporizador.esperar(this.backoffMs(reintentos));
    }
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

  private configCircuito(): ConfigCircuito {
    return {
      umbralFallos: this.configuracion.LLM_CB_UMBRAL_FALLOS,
      ventanaMs: this.configuracion.LLM_CB_VENTANA_S * 1000,
    };
  }

  // Pasada la ventana `debeLlamar` deja una sola sonda; el resultado se aplica antes de cualquier
  // `await`, así que dos turnos concurrentes nunca reciben la misma sonda.
  private circuitoPermite(modelo: string): boolean {
    const estado = this.circuitos.get(modelo) ?? CIRCUITO_INICIAL;
    const decision = debeLlamar(estado, this.clock.ahora(), this.configCircuito());
    this.circuitos.set(modelo, decision.estado);
    return decision.llamar;
  }

  private registrarFalloDeCircuito(modelo: string): void {
    const antes = this.circuitos.get(modelo) ?? CIRCUITO_INICIAL;
    const despues = registrarFallo(antes, this.clock.ahora(), this.configCircuito());
    this.circuitos.set(modelo, despues);
    if (antes.fase !== 'abierto' && despues.fase === 'abierto') {
      this.logger.warn({ evento: 'llm.circuito-abierto', modelo });
    }
  }

  // Fila de un intento que nunca llegó al proveedor (D9): techo alcanzado o circuito abierto.
  private async registrarFilaDePasarela(
    modelo: string,
    solicitud: SolicitudGeneracion,
  ): Promise<void> {
    await this.repositorioUso.registrarUso({
      proveedor: PROVEEDOR_PASARELA,
      modelo,
      tokensEntrada: 0,
      tokensSalida: 0,
      tokensCache: 0,
      costoEstimadoUsd: 0,
      latenciaMs: 0,
      exito: false,
      conversacionId: solicitud.conversacionId,
    });
  }

  private backoffMs(reintentosHechos: number): number {
    const exponencial = this.configuracion.LLM_REINTENTO_BASE_MS * 2 ** reintentosHechos;
    // El azar y su rango viven en el temporizador para que los tests no dependan de `Math.random`.
    const conJitter = exponencial + this.temporizador.azar() * JITTER_MAXIMO_MS;
    return Math.min(conJitter, this.configuracion.LLM_REINTENTO_MAX_MS);
  }

  // Precedencia (diseño, Interfaces): circuito-abierto si ningún modelo llegó a probarse; si todos
  // los probados cayeron sin respuesta útil, proveedor-caido; si no, la última causa concreta.
  private errorFinal(fallos: readonly FalloDeModelo[]): ErrorPasarelaLlm {
    const ultimo = fallos.at(-1);
    if (ultimo === undefined) {
      return new ErrorPasarelaLlm('circuito-abierto');
    }
    const ultimaConcreta = fallos.findLast((fallo) => fallo.codigo !== 'proveedor-caido');
    return new ErrorPasarelaLlm(ultimaConcreta?.codigo ?? 'proveedor-caido', ultimo.modelo);
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
