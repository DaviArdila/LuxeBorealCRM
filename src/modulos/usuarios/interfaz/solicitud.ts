import { parseCookie } from 'cookie';
import type { PerfilUsuario } from '../dominio/usuario.js';

/** Cookie de la sesión (USR2, ADR-0021): su valor es solo el id de la sesión. */
export const NOMBRE_COOKIE_SESION = 'luxe_sesion';

/** Encabezado anti-CSRF que exige toda mutación bajo `/api/v1` (USR7, D4). */
export const ENCABEZADO_CSRF = 'x-luxe-csrf';

const PREFIJO_API = '/api/v1';

/**
 * Forma mínima de la petición que leen las guardias y el controlador, sin depender de los tipos de `express`
 * (mismo criterio que `GuardiaFirmaChatwoot`). `usuario` lo deja `GuardiaSesion` en una ruta protegida.
 */
export interface SolicitudHttp {
  readonly method: string;
  readonly originalUrl?: string;
  readonly url: string;
  readonly ip?: string;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  usuario?: PerfilUsuario;
}

/** `true` si la ruta está bajo `/api/v1`; `/health` y lo demás quedan fuera de las guardias de sesión y CSRF (D3). */
export function estaBajoApi(solicitud: SolicitudHttp): boolean {
  const ruta = (solicitud.originalUrl ?? solicitud.url).split('?')[0] ?? '';
  return ruta === PREFIJO_API || ruta.startsWith(`${PREFIJO_API}/`);
}

export function primeraCabecera(valor: string | readonly string[] | undefined): string | undefined {
  if (typeof valor === 'string') return valor;
  return valor?.[0];
}

/** El id de la sesión de la cookie `luxe_sesion`, o `undefined` si no viene. */
export function leerIdSesion(solicitud: SolicitudHttp): string | undefined {
  const cabecera = primeraCabecera(solicitud.headers.cookie);
  if (cabecera === undefined) return undefined;
  return parseCookie(cabecera)[NOMBRE_COOKIE_SESION];
}
