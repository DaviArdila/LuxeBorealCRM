import { Module } from '@nestjs/common';
import { ConfiguracionModule } from './plataforma/config/index.js';
import { ErroresModule } from './plataforma/errores/index.js';
import { ObservabilidadModule } from './plataforma/observabilidad/index.js';
import { PrismaModule } from './plataforma/prisma/index.js';
import { RedisModule } from './plataforma/redis/index.js';
import { RelojModule } from './plataforma/reloj/index.js';
import { SaludModule } from './plataforma/salud/index.js';

/**
 * Módulo raíz (T9, design "Data Flow" → Arranque): solo importa los módulos de plataforma, sin
 * lógica propia. `ConfiguracionModule` y `RelojModule` son `@Global()` (no haría falta
 * reexportarlos), se listan igual para que el cableado completo de arranque quede explícito aquí.
 * `ErroresModule` (D5, T2 de la Fase 00b) registra el filtro global `problem+json`.
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
  ],
})
export class AppModule {}
