import type { ClaveSesion } from '../../src/modulos/agente/puertos/contadores-sesion.js';
import type {
  HistorialConversacion,
  TurnoHistorial,
} from '../../src/modulos/agente/puertos/historial-conversacion.js';

function clave(sesion: ClaveSesion): string {
  return `${sesion.conversacionId}:v${String(sesion.version)}`;
}

/** Doble de test de {@link HistorialConversacion}: turnos por sesión en memoria, sin TTL. */
export class HistorialEnMemoria implements HistorialConversacion {
  private readonly turnosPorSesion = new Map<string, TurnoHistorial[]>();

  leer(sesion: ClaveSesion, turnos: number): Promise<readonly TurnoHistorial[]> {
    const todos = this.turnosPorSesion.get(clave(sesion)) ?? [];
    return Promise.resolve(turnos <= 0 ? [] : todos.slice(-2 * turnos));
  }

  agregar(sesion: ClaveSesion, textoCliente: string, textoBot: string): Promise<void> {
    const actuales = this.turnosPorSesion.get(clave(sesion)) ?? [];
    this.turnosPorSesion.set(clave(sesion), [
      ...actuales,
      { rol: 'usuario', texto: textoCliente },
      { rol: 'asistente', texto: textoBot },
    ]);
    return Promise.resolve();
  }
}
