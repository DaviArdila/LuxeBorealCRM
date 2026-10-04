import { applyDecorators } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader } from '@nestjs/swagger';
import { respuestaProblema } from '../../../plataforma/documentacion/index.js';

/** Nombre del esquema de seguridad del contrato (API11); lo declara `CONFIGURACION_DOCUMENTO`. */
export const ESQUEMA_SEGURIDAD_COOKIE = 'cookieAuth';

/** Una operación protegida exige la cookie y documenta su `401` en problem+json (API11). */
export function DocumentarSesionRequerida(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiCookieAuth(ESQUEMA_SEGURIDAD_COOKIE),
    respuestaProblema(401, 'Sin sesión válida (peticion-no-autenticada).'),
  );
}

function encabezadoCsrf(): MethodDecorator & ClassDecorator {
  return ApiHeader({ name: 'X-Luxe-Csrf', required: true, description: 'Anti-CSRF: siempre `1`.', schema: { type: 'string', enum: ['1'] } });
}

/** Una mutación documenta el encabezado anti-CSRF obligatorio y su `403` (USR7, API11). */
export function DocumentarCsrf(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    encabezadoCsrf(),
    respuestaProblema(403, 'Falta el encabezado anti-CSRF (encabezado-csrf-ausente).'),
  );
}

/**
 * Una operación reservada al rol `admin` (API7, API11): exige la cookie y documenta su `401` y su `403` en problem+json.
 * Si es una mutación, además el encabezado anti-CSRF; su `403` cubre las dos causas, porque una sola respuesta por
 * estado cabe en el contrato.
 */
export function DocumentarRutaDeAdmin(opciones: { readonly mutacion: boolean }): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiCookieAuth(ESQUEMA_SEGURIDAD_COOKIE),
    respuestaProblema(401, 'Sin sesión válida (peticion-no-autenticada).'),
    respuestaProblema(
      403,
      opciones.mutacion
        ? 'Sin el rol admin (rol-insuficiente) o sin el encabezado anti-CSRF (encabezado-csrf-ausente).'
        : 'Sin el rol admin (rol-insuficiente).',
    ),
    ...(opciones.mutacion ? [encabezadoCsrf()] : []),
  );
}
