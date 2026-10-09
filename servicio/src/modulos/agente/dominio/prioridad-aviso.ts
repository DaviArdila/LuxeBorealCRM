import type { MotivoAviso } from '../../conversaciones/index.js';

/** Mayor a menor (D2 de la Fase 12d): el asesor necesita saber del lead antes que de un pedido genérico de persona. */
const PRIORIDAD: readonly MotivoAviso[] = ['lead-caliente', 'pide-persona', 'pide-asesor', 'audio-repetido'];

/**
 * Un turno avisa a lo sumo una vez: de los avisos que pidieron las políticas y las herramientas elige el de mayor
 * prioridad. El que pierde no queda marcado (D3) y avisa si vuelve a aparecer en un turno posterior.
 */
export function elegirAviso(motivos: readonly (MotivoAviso | undefined)[]): MotivoAviso | undefined {
  return PRIORIDAD.find((candidato) => motivos.includes(candidato));
}
