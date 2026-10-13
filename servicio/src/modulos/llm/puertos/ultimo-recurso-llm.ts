import type { RespuestaGeneracion, SolicitudGeneracion } from '../dominio/tipos-llm.js';

export const ULTIMO_RECURSO_LLM = Symbol('ULTIMO_RECURSO_LLM');

// Punto de extensión del nivel 2 (ADR-0002, Q4): un último recurso para cuando ningún modelo del
// perfil responde. Esta fase no registra ninguna implementación; el gateway la usa solo si existe.
export interface UltimoRecursoLlm {
  generar(solicitud: SolicitudGeneracion): Promise<RespuestaGeneracion>;
}
