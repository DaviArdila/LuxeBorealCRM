import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorDeAplicacion } from '../../../plataforma/errores/index.js';
import { ObtenerSesionActual } from '../aplicacion/obtener-sesion-actual.js';
import { CLAVE_PUBLICO } from './decoradores.js';
import { estaBajoApi, leerIdSesion, type SolicitudHttp } from './solicitud.js';

/**
 * Exige una sesión válida en toda ruta de `/api/v1` salvo las `@Publico()` (USR6, D3). Fuera de `/api/v1` (hoy solo
 * `GET /health`, que vive en `plataforma` y no puede usar el decorador) no actúa. Deja el perfil del usuario, leído
 * de la base, en `solicitud.usuario` para `GuardiaRoles` y los controladores.
 */
@Injectable()
export class GuardiaSesion implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly obtenerSesionActual: ObtenerSesionActual,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const solicitud = contexto.switchToHttp().getRequest<SolicitudHttp>();
    if (!estaBajoApi(solicitud)) return true;
    const publica = this.reflector.getAllAndOverride<boolean | undefined>(CLAVE_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (publica === true) return true;

    const usuario = await this.obtenerSesionActual.ejecutar(leerIdSesion(solicitud));
    if (usuario === null) {
      throw new ErrorDeAplicacion('peticion-no-autenticada');
    }
    solicitud.usuario = usuario;
    return true;
  }
}
