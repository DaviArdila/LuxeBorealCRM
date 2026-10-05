import { Module, type OnModuleInit } from '@nestjs/common';
import { OutboxModule, RegistroManejadoresOutbox } from '../../plataforma/outbox/index.js';
import {
  ObservadoresHandoffModule,
  ReferenciaConversacionModule,
  RegistroObservadoresEspera,
  RegistroObservadoresHandoff,
} from '../conversaciones/index.js';
import { AvisoEsperaCliente } from './aplicacion/aviso-espera-cliente.js';
import { AvisoTraspaso } from './aplicacion/aviso-traspaso.js';
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
  imports: [OutboxModule, ReferenciaConversacionModule, ObservadoresHandoffModule],
  providers: [
    { provide: NOTIFICADOR, useClass: NotificadorTelegram },
    PublicarNotificacionTelegram,
    EncolarAviso,
    ResolverEnlaceConversacion,
    AvisoTraspaso,
    AvisoEsperaCliente,
  ],
  exports: [EncolarAviso, ResolverEnlaceConversacion],
})
export class NotificacionesModule implements OnModuleInit {
  constructor(
    private readonly registroManejadoresOutbox: RegistroManejadoresOutbox,
    private readonly publicarNotificacionTelegram: PublicarNotificacionTelegram,
    private readonly registroObservadoresHandoff: RegistroObservadoresHandoff,
    private readonly avisoTraspaso: AvisoTraspaso,
    private readonly registroObservadoresEspera: RegistroObservadoresEspera,
    private readonly avisoEsperaCliente: AvisoEsperaCliente,
  ) {}

  onModuleInit(): void {
    this.registroManejadoresOutbox.registrar(TIPO_OUTBOX_NOTIFICACION_TELEGRAM, this.publicarNotificacionTelegram);
    // NTF6: avisa de los traspasos que no nacen de un lead, solo después de confirmada la transición (NTF3).
    this.registroObservadoresHandoff.registrar(this.avisoTraspaso);
    // NTF7: avisa de un cliente que espera respuesta bajo control humano (lo dispara `BarridoEsperas`).
    this.registroObservadoresEspera.registrar(this.avisoEsperaCliente);
  }
}
