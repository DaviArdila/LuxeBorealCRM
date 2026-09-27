import { Module } from '@nestjs/common';
import { CanalesModule } from './modulos/canales/index.js';
import { ColasModule } from './plataforma/colas/index.js';
import { ConfiguracionModule } from './plataforma/config/index.js';
import { ErroresModule } from './plataforma/errores/index.js';
import { ObservabilidadModule } from './plataforma/observabilidad/index.js';
import { PrismaModule } from './plataforma/prisma/index.js';
import { RedisModule } from './plataforma/redis/index.js';
import { RelojModule } from './plataforma/reloj/index.js';
import { SaludModule } from './plataforma/salud/index.js';

/**
 * Módulo raíz (T9, design "Data Flow" → Arranque; D16 de la Fase 04, T3): módulos de plataforma
 * más `CanalesModule`, el primer módulo de negocio que se registra aquí — expone el único
 * endpoint de entrada (`POST /api/v1/webhooks/chatwoot`, D16). `ConfiguracionModule` y
 * `RelojModule` son `@Global()` (no haría falta reexportarlos), se listan igual para que el
 * cableado completo de arranque quede explícito aquí. `ErroresModule` (D5, T2 de la Fase 00b)
 * registra el filtro global `problem+json`. `ColasModule` (T4, D6) es la raíz de BullMQ: se
 * registra una sola vez, antes de `CanalesModule`, que registra su propia cola con
 * `BullModule.registerQueue`.
 */
@Module({
  imports: [
    ConfiguracionModule,
    RelojModule,
    ObservabilidadModule,
    ErroresModule,
    PrismaModule,
    RedisModule,
    SaludModule,
    ColasModule,
    CanalesModule,
  ],
})
export class AppModule {}
