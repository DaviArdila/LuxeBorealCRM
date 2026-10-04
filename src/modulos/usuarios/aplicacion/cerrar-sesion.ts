import { Inject, Injectable } from '@nestjs/common';
import { ALMACEN_SESIONES, type AlmacenSesiones } from '../puertos/almacen-sesiones.js';

/** Cierra la sesión al instante (USR4): borra su clave; sin sesión no hace nada, porque la operación es idempotente. */
@Injectable()
export class CerrarSesion {
  constructor(@Inject(ALMACEN_SESIONES) private readonly sesiones: AlmacenSesiones) {}

  async ejecutar(idSesion: string | undefined): Promise<void> {
    if (idSesion === undefined || idSesion === '') return;
    await this.sesiones.borrar(idSesion);
  }
}
