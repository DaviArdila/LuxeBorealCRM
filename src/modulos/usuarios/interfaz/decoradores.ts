import { SetMetadata } from '@nestjs/common';
import type { Rol } from '../dominio/usuario.js';

export const CLAVE_PUBLICO = 'usuarios:publico';
export const CLAVE_SIN_CSRF = 'usuarios:sin-csrf';
export const CLAVE_ROLES = 'usuarios:roles';

/**
 * Abre una ruta de `/api/v1` sin sesión (USR6, D3). Todo lo demás exige sesión por defecto: una ruta nueva nace
 * cerrada aunque nadie se acuerde de protegerla.
 */
export const Publico = (): MethodDecorator & ClassDecorator => SetMetadata(CLAVE_PUBLICO, true);

/** Exime una mutación del encabezado anti-CSRF (USR7, D4). Solo el webhook de Chatwoot: no usa la cookie y lo protege su firma (R3). */
export const SinCsrf = (): MethodDecorator & ClassDecorator => SetMetadata(CLAVE_SIN_CSRF, true);

/** Exige uno de estos roles, leídos de la base en cada petición (USR6, API7, D2). */
export const Roles = (...roles: readonly Rol[]): MethodDecorator & ClassDecorator => SetMetadata(CLAVE_ROLES, roles);
