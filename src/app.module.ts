import { Module } from '@nestjs/common';
import { AgenteModule } from './modulos/agente/index.js';
import { CanalesModule } from './modulos/canales/index.js';
import { ConversacionesModule } from './modulos/conversaciones/index.js';
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
 * `BullModule.registerQueue`. `ConversacionesModule` (Fase 05, T5) se registra después de
 * `CanalesModule`: en su `onModuleInit` llama `RegistroConsumidorEventosCanal.registrar` para que
 * `ConsumidorRegistrador` (el consumidor "de por defecto" de `canales`) deje de ser el consumidor
 * real de eventos de canal. `AgenteModule` (Fase 07a, ADR-0016) implementa el puerto
 * `GENERADOR_RESPUESTA` de `conversaciones` y se compone aquí con `conGenerador`, el único lugar que
 * conoce a los dos; el módulo de la pasarela LLM no se cablea hasta la 07b.
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
    ConversacionesModule.conGenerador(AgenteModule),
  ],
})
export class AppModule {}
