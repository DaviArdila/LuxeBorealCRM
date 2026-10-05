import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/index.js';
import { ProcesadorOutbox } from './procesador-outbox.js';
import { PublicadorOutbox } from './publicador-outbox.js';
import { RegistroManejadoresOutbox } from './registro-manejadores.js';
import { RegistroOutboxPrisma } from './registro-outbox-prisma.js';
import { NOMBRE_COLA_OUTBOX, REGISTRO_OUTBOX } from './tipos.js';

/**
 * Módulo de plataforma del outbox genérico (D10 de
 * `openspec/changes/fase-04-canal-chatwoot/design.md`): reclamo con *lease*, orden estricto por
 * grupo, backoff (D12) y registro de manejadores por `tipo` (D8), sin conocer ningún módulo de
 * negocio (regla de fronteras 7 — `plataforma-no-conoce-modulos`). Registra su propia cola BullMQ
 * ({@link NOMBRE_COLA_OUTBOX}, mismo patrón que `CanalesModule` con `canales-inbox`); la
 * configuración compartida de BullMQ (conexión, prefijo) la fija `ColasModule` una sola vez, en la
 * raíz. La Fase 04/T7 importa este módulo desde `CanalesModule` y registra `PublicarEfectoCanal`
 * en {@link RegistroManejadoresOutbox} sin tocar este archivo.
 */
@Module({
  imports: [PrismaModule, BullModule.registerQueue({ name: NOMBRE_COLA_OUTBOX })],
  providers: [
    { provide: REGISTRO_OUTBOX, useClass: RegistroOutboxPrisma },
    RegistroManejadoresOutbox,
    PublicadorOutbox,
    ProcesadorOutbox,
  ],
  exports: [REGISTRO_OUTBOX, RegistroManejadoresOutbox],
})
export class OutboxModule {}
