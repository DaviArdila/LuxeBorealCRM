import { Injectable, Logger } from '@nestjs/common';

/** Lo que se sabe de un cliente que espera respuesta bajo control humano (NTF7, D5 de la Fase 08d): sin contenido (R14). */
export interface EventoEsperaCliente {
  readonly conversacionId: string;
  readonly contactoId: string;
  /** Instante del primer mensaje sin respuesta de esta espera. */
  readonly desde: Date;
  /** Minutos que lleva esperando al momento del aviso. */
  readonly esperaMin: number;
}

/** Un módulo de arriba (p. ej. `notificaciones`) que reacciona a un cliente que espera. */
export interface ObservadorEsperaCliente {
  alEsperarCliente(evento: EventoEsperaCliente): Promise<void>;
}

/**
 * Registro de observadores de espera (D5 de la Fase 08d): mismo patrón de inversión de dependencia que
 * `RegistroObservadoresHandoff` (D7 de la Fase 08) — `conversaciones` no puede importar a `notificaciones`, así que
 * esta se registra aquí en su `onModuleInit`. Un observador que falla se registra (solo el evento y el nombre del
 * error, R14) y no frena a los demás. A diferencia del de handoff, `notificar` **devuelve si todos cumplieron**:
 * el barrido de esperas lo usa para devolver la espera y reintentar en el siguiente barrido en vez de perderla.
 */
@Injectable()
export class RegistroObservadoresEspera {
  private readonly logger = new Logger(RegistroObservadoresEspera.name);
  private readonly observadores: ObservadorEsperaCliente[] = [];

  registrar(observador: ObservadorEsperaCliente): void {
    this.observadores.push(observador);
  }

  async notificar(evento: EventoEsperaCliente): Promise<boolean> {
    let todosCumplieron = true;
    for (const observador of this.observadores) {
      try {
        await observador.alEsperarCliente(evento);
      } catch (error) {
        todosCumplieron = false;
        this.logger.warn({
          evento: 'conversaciones.observador-espera-fallo',
          error: error instanceof Error ? error.name : 'desconocido',
        });
      }
    }
    return todosCumplieron;
  }
}
