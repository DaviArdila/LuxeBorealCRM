import { Injectable, Logger } from '@nestjs/common';
import type { EventoCanal } from '../dominio/evento-canal.js';
import type { ConsumidorEventosCanal } from '../puertos/consumidor-eventos-canal.js';

/**
 * Consumidor de eventos por defecto (D8 de `design.md`, skill `luxeboreal-fases` §4: "primero la
 * entrada con un procesador que solo registra"). Mientras ningún módulo se registre por su cuenta
 * (`RegistroConsumidorEventosCanal.registrar`, la Fase 05 lo hará desde `conversaciones`), este es
 * el único consumidor de esta fase: solo deja constancia en el log de tipo, ids y canal, nunca
 * contenido del mensaje (R14).
 */
@Injectable()
export class ConsumidorRegistrador implements ConsumidorEventosCanal {
  private readonly logger = new Logger(ConsumidorRegistrador.name);

  consumir(evento: EventoCanal): Promise<void> {
    this.logger.log(
      `Evento de canal consumido: tipo=${evento.tipo} conversacion=${evento.conversacion.idExterno} ` +
        `canal=${evento.conversacion.canal}`,
    );
    return Promise.resolve();
  }
}
