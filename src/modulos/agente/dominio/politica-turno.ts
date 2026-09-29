import type { RespuestaTurno, SolicitudTurno } from '../../conversaciones/index.js';

/**
 * Resultado de una política (D6 de la Fase 07a): o deja pasar al siguiente eslabón del pipeline, o
 * responde y lo corta. `cuentaTurno` dice si esa respuesta consume un turno de la sesión (R13): un
 * sticker se ignora sin gastar turno; lo decide la política, lo registra el motor (un solo lugar).
 */
export type DecisionPolitica =
  | { readonly decision: 'seguir' }
  | { readonly decision: 'responder'; readonly respuesta: RespuestaTurno; readonly cuentaTurno: boolean };

/** Una pieza del pipeline del turno (AGT1). Agregar una política no exige tocar las demás (A5). */
export interface PoliticaTurno {
  evaluar(solicitud: SolicitudTurno): Promise<DecisionPolitica>;
}

/** Token de la lista ordenada de políticas que recorre el motor: el orden lo fija el módulo. */
export const POLITICAS_TURNO = Symbol('POLITICAS_TURNO');
