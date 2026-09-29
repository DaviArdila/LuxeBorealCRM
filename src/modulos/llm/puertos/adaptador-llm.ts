import type {
  LlamadaHerramienta,
  SolicitudGeneracion,
  UsoReportado,
} from '../dominio/tipos-llm.js';

export type ClaseErrorAdaptador = 'reintentable' | 'no-reintentable';
export type CausaErrorAdaptador = 'timeout' | 'http' | 'sin-respuesta';

export class AdaptadorLlmError extends Error {
  readonly clase: ClaseErrorAdaptador;
  readonly causa: CausaErrorAdaptador;
  readonly estadoHttp?: number;

  constructor(clase: ClaseErrorAdaptador, causa: CausaErrorAdaptador, estadoHttp?: number) {
    super(
      estadoHttp === undefined
        ? `Adaptador LLM: ${clase} por ${causa}`
        : `Adaptador LLM: ${clase} por ${causa} (${estadoHttp})`,
    );
    this.name = 'AdaptadorLlmError';
    this.clase = clase;
    this.causa = causa;
    if (estadoHttp !== undefined) {
      this.estadoHttp = estadoHttp;
    }
  }
}

export interface LimiteIntento {
  readonly maxTokens: number;
  readonly abort: AbortSignal;
}

export interface ResultadoAdaptador {
  readonly texto?: string;
  readonly llamadas?: readonly LlamadaHerramienta[];
  readonly uso: UsoReportado;
  readonly metadatos?: unknown;
}

// Puerto interno del módulo: no sale en el barril (LLM11). Un intento por llamada, sin reintentos
// propios (restricción de ADR-0002): el gateway decide reintento, fallback y circuito.
export const ADAPTADOR_LLM = Symbol('ADAPTADOR_LLM');

export interface AdaptadorLlm {
  generarConModelo(
    modelo: string,
    solicitud: SolicitudGeneracion,
    limite: LimiteIntento,
  ): Promise<ResultadoAdaptador>;
}
