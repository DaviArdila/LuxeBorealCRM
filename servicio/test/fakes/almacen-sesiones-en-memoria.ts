import type { Sesion } from '../../src/modulos/usuarios/dominio/sesion.js';
import type { AlmacenSesiones } from '../../src/modulos/usuarios/puertos/almacen-sesiones.js';

/** Doble de test de {@link AlmacenSesiones}, sin TTL: el vencimiento por inactividad se prueba contra Redis real. */
export class AlmacenSesionesEnMemoria implements AlmacenSesiones {
  readonly sesiones = new Map<string, Sesion>();
  private siguiente = 0;

  crear(sesion: Sesion): Promise<string> {
    this.siguiente += 1;
    const id = `sesion-${String(this.siguiente)}`;
    this.sesiones.set(id, sesion);
    return Promise.resolve(id);
  }

  leerYRenovar(id: string, ahora: Date): Promise<Sesion | null> {
    const sesion = this.sesiones.get(id);
    if (sesion === undefined) return Promise.resolve(null);
    const renovada = { ...sesion, ultimaActividad: ahora };
    this.sesiones.set(id, renovada);
    return Promise.resolve(renovada);
  }

  borrar(id: string): Promise<void> {
    this.sesiones.delete(id);
    return Promise.resolve();
  }
}
