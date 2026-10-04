import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../../plataforma/config/index.js';
import { CLOCK, type Clock } from '../../../plataforma/reloj/index.js';
import { sesionVencida } from '../dominio/sesion.js';
import { perfilDe, type PerfilUsuario } from '../dominio/usuario.js';
import { ALMACEN_SESIONES, type AlmacenSesiones } from '../puertos/almacen-sesiones.js';
import { REPOSITORIO_USUARIO, type RepositorioUsuario } from '../puertos/repositorio-usuario.js';

/**
 * Resuelve la sesión de una petición (USR3, USR5, USR6, D2): la lee y renueva su plazo de inactividad, aplica la
 * duración máxima y lee el usuario de la base, así un usuario desactivado o con otro rol se ve en la siguiente
 * petición. Una sesión vencida o de un usuario que ya no puede entrar se borra.
 */
@Injectable()
export class ObtenerSesionActual {
  constructor(
    @Inject(REPOSITORIO_USUARIO) private readonly repositorio: RepositorioUsuario,
    @Inject(ALMACEN_SESIONES) private readonly sesiones: AlmacenSesiones,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIGURACION) private readonly configuracion: Pick<Configuracion, 'SESION_DURACION_MAX_H'>,
  ) {}

  /** `null` si no hay una sesión válida. */
  async ejecutar(idSesion: string | undefined): Promise<PerfilUsuario | null> {
    if (idSesion === undefined || idSesion === '') return null;
    const ahora = this.clock.ahora();
    const sesion = await this.sesiones.leerYRenovar(idSesion, ahora);
    if (sesion === null) return null;

    if (sesionVencida(sesion.creada, ahora, this.configuracion.SESION_DURACION_MAX_H)) {
      await this.sesiones.borrar(idSesion);
      return null;
    }
    const usuario = await this.repositorio.buscarPorId(sesion.usuarioId);
    if (usuario === null || !usuario.activo) {
      await this.sesiones.borrar(idSesion);
      return null;
    }
    return perfilDe(usuario);
  }
}
