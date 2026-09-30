import { Inject, Injectable } from '@nestjs/common';
import { FalloPublicacion, type EntradaOutbox, type ManejadorOutbox } from '../../../plataforma/outbox/index.js';
import { FalloNotificacion, NOTIFICADOR, type Notificador } from '../puertos/notificador.js';
import { TIPO_OUTBOX_NOTIFICACION_TELEGRAM } from './encolar-aviso.js';

/**
 * Manejador de outbox del tipo `notificacion.telegram` (D9 de la Fase 08): lee el texto efímero de la fila
 * y lo entrega por el {@link Notificador}. Traduce {@link FalloNotificacion} a {@link FalloPublicacion}
 * para que el publicador decida el reintento (NTF4); el mensaje de la causa ya viene sin datos sensibles.
 */
@Injectable()
export class PublicarNotificacionTelegram implements ManejadorOutbox {
  constructor(@Inject(NOTIFICADOR) private readonly notificador: Notificador) {}

  async publicar(entrada: EntradaOutbox): Promise<void> {
    const texto = entrada.efimero?.texto;
    if (typeof texto !== 'string') {
      throw new FalloPublicacion('permanente', `fila de outbox ${TIPO_OUTBOX_NOTIFICACION_TELEGRAM} sin texto`);
    }
    try {
      await this.notificador.enviar(texto);
    } catch (error) {
      if (error instanceof FalloNotificacion) {
        throw new FalloPublicacion(error.naturaleza, error.causa, error.esperaSugeridaS);
      }
      throw error;
    }
  }
}
