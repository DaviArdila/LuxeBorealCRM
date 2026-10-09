import { Injectable, Logger } from '@nestjs/common';
import type { MotivoAviso } from '../puertos/generador-respuesta.js';

/** Lo que se sabe de un aviso al asesor cuyos pasos de respuesta ya quedaron encolados (CNV13). */
export interface EventoAviso {
  readonly conversacionId: string;
  readonly contactoId: string;
  readonly motivo: MotivoAviso;
  /** Versión de la conversación: constante mientras sigue en `bot`, así que identifica la sesión bot (NTF8). */
  readonly version: number;
}

/** Un módulo de arriba (`notificaciones`, `leads`) que reacciona a un aviso al asesor. */
export interface ObservadorAviso {
  alAvisarAsesor(evento: EventoAviso): Promise<void>;
}

/**
 * Registro de observadores de aviso (D4 de la Fase 12d): mismo patrón de inversión de dependencia que el de handoff.
 * `ProcesarTurno` notifica **después** de encolar los pasos de la respuesta (NTF3). Un observador que falla se
 * registra (solo el evento y el nombre del error, R14) y no frena a los demás; `notificar` responde `false` para
 * que el llamador libere la marca del motivo (CNV14).
 */
@Injectable()
export class RegistroObservadoresAviso {
  private readonly logger = new Logger(RegistroObservadoresAviso.name);
  private readonly observadores: ObservadorAviso[] = [];

  registrar(observador: ObservadorAviso): void {
    this.observadores.push(observador);
  }

  /** `true` si todos los observadores terminaron bien. */
  async notificar(evento: EventoAviso): Promise<boolean> {
    let todosBien = true;
    for (const observador of this.observadores) {
      try {
        await observador.alAvisarAsesor(evento);
      } catch (error) {
        todosBien = false;
        this.logger.warn({
          evento: 'conversaciones.observador-aviso-fallo',
          error: error instanceof Error ? error.name : 'desconocido',
        });
      }
    }
    return todosBien;
  }
}
