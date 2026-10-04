const HORA_MS = 60 * 60 * 1000;

/** USR3: la sesión deja de valer al cumplir `duracionMaxH` horas desde su creación, haya actividad o no. */
export function sesionVencida(creada: Date, ahora: Date, duracionMaxH: number): boolean {
  return ahora.getTime() - creada.getTime() >= duracionMaxH * HORA_MS;
}

/** Lo que guarda una sesión (USR3): nunca el correo ni la contraseña (R14). */
export interface Sesion {
  readonly usuarioId: string;
  readonly creada: Date;
  readonly ultimaActividad: Date;
}
