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

/** Una mutación documenta el encabezado anti-CSRF obligatorio y su `403` (USR7, API11). */
export function DocumentarCsrf(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiHeader({ name: 'X-Luxe-Csrf', required: true, description: 'Anti-CSRF: siempre `1`.', schema: { type: 'string', enum: ['1'] } }),
    respuestaProblema(403, 'Falta el encabezado anti-CSRF (encabezado-csrf-ausente).'),
  );
}
