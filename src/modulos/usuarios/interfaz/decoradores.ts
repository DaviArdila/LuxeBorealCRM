import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { PerfilUsuario, Rol } from '../dominio/usuario.js';
import type { SolicitudHttp } from './solicitud.js';

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

/**
 * El usuario de la sesión, leído de la base por `GuardiaSesion` en esta petición (USR6, D2). Solo existe en rutas
 * protegidas; en una `@Publico()` es `undefined`, por eso el tipo de quien lo recibe debe ser el de una ruta protegida.
 */
export const UsuarioActual = createParamDecorator((_dato: unknown, contexto: ExecutionContext): PerfilUsuario | undefined =>
  contexto.switchToHttp().getRequest<SolicitudHttp>().usuario,
);
