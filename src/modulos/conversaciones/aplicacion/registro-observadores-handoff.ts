import { Injectable, Logger } from '@nestjs/common';
import type { MotivoHandoff } from '../puertos/generador-respuesta.js';

/** Lo que se sabe de un handoff que ya quedó confirmado en la base (D7 de la Fase 08, NTF3). */
export interface EventoHandoff {
  readonly conversacionId: string;
  readonly contactoId: string;
  readonly motivo: MotivoHandoff;
  /**
   * Versión de la conversación **antes** de la transición (NTF6, D3 de la Fase 08d): identifica la sesión bot que
   * termina. Cada traspaso posterior tiene otra, así que sirve de parte de la clave de idempotencia de un aviso.
   */
  readonly version: number;
}

/** Un módulo de arriba (p. ej. `leads`) que reacciona a un handoff confirmado. */
export interface ObservadorHandoff {
  alConfirmarHandoff(evento: EventoHandoff): Promise<void>;
}

/**
 * Registro de observadores de handoff (D7 de la Fase 08): mismo patrón de inversión de dependencia que
 * `RegistroConsumidorEventosCanal` (Fase 04, D8) — `conversaciones` no puede importar a `leads`, así que
 * `leads` se registra aquí en su `onModuleInit`. `ProcesarTurno` notifica **después** de que la
 * transición quedó confirmada (NTF3). Un observador que falla se registra (solo el evento y el nombre
 * del error, R14) y no revierte el handoff ni frena a los demás: el efecto que perdió lo recupera su
 * propio mecanismo de reintento.
 */
@Injectable()
export class RegistroObservadoresHandoff {
  private readonly logger = new Logger(RegistroObservadoresHandoff.name);
  private readonly observadores: ObservadorHandoff[] = [];

  registrar(observador: ObservadorHandoff): void {
    this.observadores.push(observador);
  }

  async notificar(evento: EventoHandoff): Promise<void> {
    for (const observador of this.observadores) {
      try {
        await observador.alConfirmarHandoff(evento);
      } catch (error) {
        this.logger.warn({
          evento: 'conversaciones.observador-handoff-fallo',
          error: error instanceof Error ? error.name : 'desconocido',
        });
      }
    }
  }
}
