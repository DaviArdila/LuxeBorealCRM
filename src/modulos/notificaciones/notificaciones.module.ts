import { Module, type OnModuleInit } from '@nestjs/common';
import { OutboxModule, RegistroManejadoresOutbox } from '../../plataforma/outbox/index.js';
import { EncolarAviso, TIPO_OUTBOX_NOTIFICACION_TELEGRAM } from './aplicacion/encolar-aviso.js';
import { PublicarNotificacionTelegram } from './aplicacion/publicar-notificacion-telegram.js';
import { NotificadorTelegram } from './infraestructura/notificador-telegram.js';
import { NOTIFICADOR } from './puertos/notificador.js';

/**
 * Módulo de notificaciones (Fase 08, D9): avisos a los asesores por un puerto propio (`Notificador`)
 * implementado con Telegram y entregado por el outbox. Registra su manejador en `onModuleInit`, igual que
 * `CanalesModule`; `leads` consume `EncolarAviso`. No importa ningún módulo de negocio.
 */
@Module({
  imports: [OutboxModule],
  providers: [{ provide: NOTIFICADOR, useClass: NotificadorTelegram }, PublicarNotificacionTelegram, EncolarAviso],
  exports: [EncolarAviso],
})
export class NotificacionesModule implements OnModuleInit {
  constructor(
    private readonly registroManejadoresOutbox: RegistroManejadoresOutbox,
    private readonly publicarNotificacionTelegram: PublicarNotificacionTelegram,
  ) {}

  onModuleInit(): void {
    this.registroManejadoresOutbox.registrar(TIPO_OUTBOX_NOTIFICACION_TELEGRAM, this.publicarNotificacionTelegram);
  }
}
