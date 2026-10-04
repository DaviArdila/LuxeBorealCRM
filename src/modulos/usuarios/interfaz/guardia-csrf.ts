import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorDeAplicacion } from '../../../plataforma/errores/index.js';
import { CLAVE_SIN_CSRF } from './decoradores.js';
import { ENCABEZADO_CSRF, estaBajoApi, primeraCabecera, type SolicitudHttp } from './solicitud.js';

const MUTACIONES: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Exige `X-Luxe-Csrf: 1` en toda mutación bajo `/api/v1`, también en las públicas como el inicio de sesión (USR7,
 * D4). Corre antes que la sesión, así una mutación sin el encabezado no toca Redis ni ejecuta nada.
 */
@Injectable()
export class GuardiaCsrf implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const solicitud = contexto.switchToHttp().getRequest<SolicitudHttp>();
    if (!MUTACIONES.has(solicitud.method.toUpperCase()) || !estaBajoApi(solicitud)) return true;
    const exenta = this.reflector.getAllAndOverride<boolean | undefined>(CLAVE_SIN_CSRF, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (exenta === true) return true;
    if (primeraCabecera(solicitud.headers[ENCABEZADO_CSRF]) !== '1') {
      throw new ErrorDeAplicacion('encabezado-csrf-ausente');
    }
    return true;
  }
}
