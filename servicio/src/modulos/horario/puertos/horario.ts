/**
 * Puerto de la aplicación del horario de atención (design.md, tabla "Puertos y adaptadores", fila
 * `HORARIO`). La implementación real, `HorarioAtencion`, orquesta el dominio (`horario.ts`) y
 * {@link REPOSITORIO_HORARIO} — llega en T9; aquí solo se declara el contrato (HOR7: sin `fecha`
 * explícita, la implementación usa el `Clock` inyectado, nunca `Date.now()`/`new Date()`).
 */
export const HORARIO = Symbol('HORARIO');

export interface Horario {
  estaDentroDeHorario(fecha?: Date): Promise<boolean>;
}
