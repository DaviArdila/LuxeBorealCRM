import type { Sesion } from '../dominio/sesion.js';

export const ALMACEN_SESIONES = Symbol('ALMACEN_SESIONES');

/** Sesiones opacas con vencimiento por inactividad (USR3, D1, ADR-0021). */
export interface AlmacenSesiones {
  /** Guarda la sesión y devuelve su id aleatorio, que es el valor de la cookie. */
  crear(sesion: Sesion): Promise<string>;
  /** Devuelve la sesión y renueva su plazo de inactividad; `null` si no existe o venció. */
  leerYRenovar(id: string, ahora: Date): Promise<Sesion | null>;
  /** Idempotente: borrar una sesión que no existe no falla. */
  borrar(id: string): Promise<void>;
}
