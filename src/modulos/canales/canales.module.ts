import { Module } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { RegistrarEventoEntrante } from './aplicacion/registrar-evento-entrante.js';
import { ColaEventosEntrantesDoble } from './infraestructura/cola-eventos-entrantes-doble.js';
import { RepositorioEventoEntrantePrisma } from './infraestructura/repositorio-evento-entrante-prisma.js';
import { WebhookChatwootController } from './interfaz/webhook-chatwoot.controller.js';
import { COLA_EVENTOS_ENTRANTES } from './puertos/cola-eventos-entrantes.js';
import { REPOSITORIO_EVENTO_ENTRANTE } from './puertos/repositorio-evento-entrante.js';

/**
 * Módulo de canales (design.md, tabla "Módulos y dependencias"; D16). Primer módulo de negocio
 * registrado en `AppModule` (T3): expone el único endpoint de entrada
 * (`POST /api/v1/webhooks/chatwoot`). Importa `plataforma/prisma` (regla de fronteras
 * `prisma-service-solo-en-infraestructura`: solo `infraestructura/` y este archivo pueden tocarlo).
 * No importa `plataforma/observabilidad`: ningún provider de aquí usa `@InjectPinoLogger`
 * (`RegistrarEventoEntrante` usa `Logger` de `@nestjs/common`, ver su propio TSDoc — hallazgo real
 * de esta tarea con `@nestjs/testing`), así que no hace falta.
 * `plataforma/colas` y `plataforma/outbox` llegan en T4/T6 — hasta entonces, `COLA_EVENTOS_ENTRANTES`
 * lo resuelve `ColaEventosEntrantesDoble` (D16), que T4 sustituye por
 * `ColaEventosEntrantesBullmq` sin tocar `RegistrarEventoEntrante` ni este import de módulos de
 * negocio (`canales` no importa ningún otro `modulos/`, regla 7 de `design.md`).
 */
@Module({
  imports: [PrismaModule],
  controllers: [WebhookChatwootController],
  providers: [
    { provide: REPOSITORIO_EVENTO_ENTRANTE, useClass: RepositorioEventoEntrantePrisma },
    { provide: COLA_EVENTOS_ENTRANTES, useClass: ColaEventosEntrantesDoble },
    RegistrarEventoEntrante,
  ],
})
export class CanalesModule {}
