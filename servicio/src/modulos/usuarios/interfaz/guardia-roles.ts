import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorDeAplicacion } from '../../../plataforma/errores/index.js';
import type { Rol } from '../dominio/usuario.js';
import { CLAVE_ROLES } from './decoradores.js';
import type { SolicitudHttp } from './solicitud.js';

/** Rechaza con `rol-insuficiente` a quien no tiene un rol de `@Roles(...)` (USR6, API7); el rol viene de la base (D2). */
@Injectable()
export class GuardiaRoles implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<readonly Rol[] | undefined>(CLAVE_ROLES, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (roles === undefined || roles.length === 0) return true;
    const { usuario } = contexto.switchToHttp().getRequest<SolicitudHttp>();
    if (usuario === undefined) {
      throw new ErrorDeAplicacion('peticion-no-autenticada');
    }
    if (!roles.includes(usuario.rol)) {
      throw new ErrorDeAplicacion('rol-insuficiente');
    }
    return true;
  }
}
