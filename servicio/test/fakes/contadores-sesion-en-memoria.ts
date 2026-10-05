import type { ClaveSesion, ContadoresSesion } from '../../src/modulos/agente/puertos/contadores-sesion.js';

function clave(sesion: ClaveSesion): string {
  return `${sesion.conversacionId}:v${String(sesion.version)}`;
}

/** Doble de test de {@link ContadoresSesion}: cuentas por sesión en memoria, sin TTL. */
export class ContadoresSesionEnMemoria implements ContadoresSesion {
  private readonly cuentaTurnos = new Map<string, number>();
  private readonly cuentaAudios = new Map<string, number>();
  private readonly cuentaFotos = new Map<string, number>();

  turnos(sesion: ClaveSesion): Promise<number> {
    return Promise.resolve(this.cuentaTurnos.get(clave(sesion)) ?? 0);
  }

  registrarTurno(sesion: ClaveSesion): Promise<void> {
    this.cuentaTurnos.set(clave(sesion), (this.cuentaTurnos.get(clave(sesion)) ?? 0) + 1);
    return Promise.resolve();
  }

  sumarAudio(sesion: ClaveSesion): Promise<number> {
    const nueva = (this.cuentaAudios.get(clave(sesion)) ?? 0) + 1;
    this.cuentaAudios.set(clave(sesion), nueva);
    return Promise.resolve(nueva);
  }

  fotosIndividuales(sesion: ClaveSesion): Promise<number> {
    return Promise.resolve(this.cuentaFotos.get(clave(sesion)) ?? 0);
  }

  sumarFotosIndividuales(sesion: ClaveSesion, cantidad: number): Promise<void> {
    this.cuentaFotos.set(clave(sesion), (this.cuentaFotos.get(clave(sesion)) ?? 0) + cantidad);
    return Promise.resolve();
  }

  reiniciarAudios(sesion: ClaveSesion): Promise<void> {
    this.cuentaAudios.delete(clave(sesion));
    return Promise.resolve();
  }

  /** Cuenta actual de audios de la sesión, para aserciones. */
  audios(sesion: ClaveSesion): number {
    return this.cuentaAudios.get(clave(sesion)) ?? 0;
  }
}
