/** Token de inyección del puerto {@link InterruptorGlobal} (D14 de `design.md`). */
export const INTERRUPTOR_GLOBAL = Symbol('INTERRUPTOR_GLOBAL');

/**
 * Puerto de solo lectura del kill switch global `bot:activo` (D14). El endpoint que lo escribe es
 * de la Fase 09; esta fase solo lee, con default `activo` cuando la clave no existe.
 */
export interface InterruptorGlobal {
  estaActivo(): Promise<boolean>;
}
