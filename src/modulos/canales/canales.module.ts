import { BullModule } from '@nestjs/bullmq';
import { Module, type OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { OutboxModule, RegistroManejadoresOutbox } from '../../plataforma/outbox/index.js';
import { ConsumidorRegistrador } from './aplicacion/consumidor-registrador.js';
import { ProcesarEventoEntrante } from './aplicacion/procesar-evento-entrante.js';
import { PublicarEfectoCanal } from './aplicacion/publicar-efecto-canal.js';
import { RegistrarEventoEntrante } from './aplicacion/registrar-evento-entrante.js';
import { RegistroConsumidorEventosCanal } from './aplicacion/registro-consumidor-eventos-canal.js';
import { RegistroGuardiaEnvioCanal } from './aplicacion/registro-guardia-envio-canal.js';
import { SalidaCanalOutbox, TIPO_OUTBOX_ESTADO, TIPO_OUTBOX_ETIQUETAS, TIPO_OUTBOX_MENSAJE } from './aplicacion/salida-canal-outbox.js';
import {
  ColaEventosEntrantesBullmq,
  NOMBRE_COLA_INBOX,
} from './infraestructura/cola-eventos-entrantes-bullmq.js';
import { AdaptadorCanalChatwoot } from './infraestructura/chatwoot/adaptador-canal-chatwoot.js';
import { ClienteChatwoot } from './infraestructura/chatwoot/cliente-chatwoot.js';
import { LectorMensajeCanalChatwoot } from './infraestructura/chatwoot/lector-mensaje-canal-chatwoot.js';
import { ProcesadorInbox } from './infraestructura/procesador-inbox.js';
import { RepositorioEventoEntrantePrisma } from './infraestructura/repositorio-evento-entrante-prisma.js';
import { WebhookChatwootController } from './interfaz/webhook-chatwoot.controller.js';
import { ADAPTADOR_CANAL } from './puertos/adaptador-canal.js';
import { CONSUMIDOR_EVENTOS_CANAL } from './puertos/consumidor-eventos-canal.js';
import { COLA_EVENTOS_ENTRANTES } from './puertos/cola-eventos-entrantes.js';
import { LECTOR_MENSAJE_CANAL } from './puertos/lector-mensaje-canal.js';
import { REPOSITORIO_EVENTO_ENTRANTE } from './puertos/repositorio-evento-entrante.js';
import { SALIDA_CANAL } from './puertos/salida-canal.js';

/**
 * Módulo de canales (design.md, tabla "Módulos y dependencias"; D16). Primer módulo de negocio
 * registrado en `AppModule` (T3): expone el único endpoint de entrada
 * (`POST /api/v1/webhooks/chatwoot`). Importa `plataforma/prisma` (regla de fronteras
 * `prisma-service-solo-en-infraestructura`: solo `infraestructura/` y este archivo pueden tocarlo)
 * y `BullModule.registerQueue` para su propia cola (D6, D16); la configuración compartida de
 * BullMQ la fija `ColasModule` una sola vez, en `AppModule`. No importa `plataforma/observabilidad`:
 * ningún provider de aquí usa `@InjectPinoLogger` (`RegistrarEventoEntrante` usa `Logger` de
 * `@nestjs/common`, ver su propio TSDoc — hallazgo real de T3 con `@nestjs/testing`).
 * `COLA_EVENTOS_ENTRANTES` ahora lo resuelve `ColaEventosEntrantesBullmq` (T4, D6/D7), que
 * sustituye al doble de T3 sin tocar `RegistrarEventoEntrante`. `CONSUMIDOR_EVENTOS_CANAL` provee
 * `ConsumidorRegistrador` como consumidor "de por defecto" (D8); la Fase 05 lo sustituye llamando
 * `RegistroConsumidorEventosCanal.registrar` desde `conversaciones`, sin tocar este módulo.
 *
 * T7 (D9): importa `OutboxModule` de plataforma y provee `SALIDA_CANAL` con `SalidaCanalOutbox`
 * (exportado, D9) y `ADAPTADOR_CANAL` con `AdaptadorCanalChatwoot`/`ClienteChatwoot` (interno, no
 * exportado). En `onModuleInit` registra la única instancia de `PublicarEfectoCanal` para los tres
 * `tipo` de outbox que `SalidaCanalOutbox` produce — mismo patrón de registro por `tipo` que D8,
 * aplicado aquí a `RegistroManejadoresOutbox` de `plataforma/outbox`.
 *
 * CAN9 (07a): `RegistroGuardiaEnvioCanal` se exporta para que `conversaciones` registre su guardia de
 * envío por paso desde `onModuleInit`, igual que hace con el consumidor de eventos.
 */
@Module({
  imports: [PrismaModule, OutboxModule, BullModule.registerQueue({ name: NOMBRE_COLA_INBOX })],
  controllers: [WebhookChatwootController],
  providers: [
    { provide: REPOSITORIO_EVENTO_ENTRANTE, useClass: RepositorioEventoEntrantePrisma },
    { provide: COLA_EVENTOS_ENTRANTES, useClass: ColaEventosEntrantesBullmq },
    { provide: CONSUMIDOR_EVENTOS_CANAL, useClass: ConsumidorRegistrador },
    { provide: SALIDA_CANAL, useClass: SalidaCanalOutbox },
    { provide: ADAPTADOR_CANAL, useClass: AdaptadorCanalChatwoot },
    { provide: LECTOR_MENSAJE_CANAL, useClass: LectorMensajeCanalChatwoot },
    ClienteChatwoot,
    RegistrarEventoEntrante,
    RegistroConsumidorEventosCanal,
    RegistroGuardiaEnvioCanal,
    ProcesarEventoEntrante,
    ProcesadorInbox,
    PublicarEfectoCanal,
  ],
  exports: [SALIDA_CANAL, LECTOR_MENSAJE_CANAL, RegistroConsumidorEventosCanal, RegistroGuardiaEnvioCanal],
})
export class CanalesModule implements OnModuleInit {
  constructor(
    private readonly registroManejadoresOutbox: RegistroManejadoresOutbox,
    private readonly publicarEfectoCanal: PublicarEfectoCanal,
  ) {}

  onModuleInit(): void {
    this.registroManejadoresOutbox.registrar(TIPO_OUTBOX_MENSAJE, this.publicarEfectoCanal);
    this.registroManejadoresOutbox.registrar(TIPO_OUTBOX_ESTADO, this.publicarEfectoCanal);
    this.registroManejadoresOutbox.registrar(TIPO_OUTBOX_ETIQUETAS, this.publicarEfectoCanal);
  }
}
