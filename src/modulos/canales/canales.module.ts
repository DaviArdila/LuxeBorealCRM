import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { ConsumidorRegistrador } from './aplicacion/consumidor-registrador.js';
import { ProcesarEventoEntrante } from './aplicacion/procesar-evento-entrante.js';
import { RegistrarEventoEntrante } from './aplicacion/registrar-evento-entrante.js';
import { RegistroConsumidorEventosCanal } from './aplicacion/registro-consumidor-eventos-canal.js';
import {
  ColaEventosEntrantesBullmq,
  NOMBRE_COLA_INBOX,
} from './infraestructura/cola-eventos-entrantes-bullmq.js';
import { ProcesadorInbox } from './infraestructura/procesador-inbox.js';
import { RepositorioEventoEntrantePrisma } from './infraestructura/repositorio-evento-entrante-prisma.js';
import { WebhookChatwootController } from './interfaz/webhook-chatwoot.controller.js';
import { CONSUMIDOR_EVENTOS_CANAL } from './puertos/consumidor-eventos-canal.js';
import { COLA_EVENTOS_ENTRANTES } from './puertos/cola-eventos-entrantes.js';
import { REPOSITORIO_EVENTO_ENTRANTE } from './puertos/repositorio-evento-entrante.js';

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
 */
@Module({
  imports: [PrismaModule, BullModule.registerQueue({ name: NOMBRE_COLA_INBOX })],
  controllers: [WebhookChatwootController],
  providers: [
    { provide: REPOSITORIO_EVENTO_ENTRANTE, useClass: RepositorioEventoEntrantePrisma },
    { provide: COLA_EVENTOS_ENTRANTES, useClass: ColaEventosEntrantesBullmq },
    { provide: CONSUMIDOR_EVENTOS_CANAL, useClass: ConsumidorRegistrador },
    RegistrarEventoEntrante,
    RegistroConsumidorEventosCanal,
    ProcesarEventoEntrante,
    ProcesadorInbox,
  ],
})
export class CanalesModule {}
