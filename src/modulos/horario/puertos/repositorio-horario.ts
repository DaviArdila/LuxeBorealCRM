/**
 * Puerto de acceso a los datos crudos del horario de atención (design.md D5, tabla "Puertos y
 * adaptadores", fila `REPOSITORIO_HORARIO`). Solo mueve datos: `obtenerPatronSemanal` devuelve el
 * valor crudo de `parametro.horario_atencion` tal como está guardado (`jsonb`), sin parsear ni
 * validar su forma — esa validación la hace el dominio (`decidirDentroDeHorario`, T4).
 */
export const REPOSITORIO_HORARIO = Symbol('REPOSITORIO_HORARIO');

export interface RepositorioHorario {
  /** `true` solo si existe una fila en `excepcion_horario` para esa fecha exacta. */
  existeExcepcion(fechaIso: string): Promise<boolean>;
  /** Valor crudo de `parametro.horario_atencion`, o `null` si no existe la fila. */
  obtenerPatronSemanal(): Promise<unknown>;
}
