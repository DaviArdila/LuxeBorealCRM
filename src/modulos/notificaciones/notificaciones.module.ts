import { Module, type OnModuleInit } from '@nestjs/common';
import { OutboxModule, RegistroManejadoresOutbox } from '../../plataforma/outbox/index.js';
import { ReferenciaConversacionModule } from '../conversaciones/index.js';
import { EncolarAviso, TIPO_OUTBOX_NOTIFICACION_TELEGRAM } from './aplicacion/encolar-aviso.js';
import { PublicarNotificacionTelegram } from './aplicacion/publicar-notificacion-telegram.js';
import { ResolverEnlaceConversacion } from './aplicacion/resolver-enlace-conversacion.js';
import { NotificadorTelegram } from './infraestructura/notificador-telegram.js';
import { NOTIFICADOR } from './puertos/notificador.js';

/**
 * Módulo de notificaciones (Fase 08, D9): avisos a los asesores por un puerto propio (`Notificador`)
 * implementado con Telegram y entregado por el outbox. Registra su manejador en `onModuleInit`, igual que
 * `CanalesModule`; `leads` consume `EncolarAviso`. Desde la Fase 08d importa `ReferenciaConversacionModule` (la
 * lectura mínima de `conversaciones`) para armar el enlace a Chatwoot (NTF5); no instancia nada más de ese módulo.
 */
@Module({
  imports: [OutboxModule, ReferenciaConversacionModule],
  providers: [
    { provide: NOTIFICADOR, useClass: NotificadorTelegram },
    PublicarNotificacionTelegram,
    EncolarAviso,
    ResolverEnlaceConversacion,
  ],
  exports: [EncolarAviso, ResolverEnlaceConversacion],
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
