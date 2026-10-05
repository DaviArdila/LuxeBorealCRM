import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ObservabilidadModule } from '../observabilidad/index.js';
import { FiltroProblemJson } from './filtro-problem-json.js';

/**
 * Módulo de errores de plataforma (D5). Registra {@link FiltroProblemJson} como `APP_FILTER`
 * global — ningún controlador necesita `@UseFilters()` para obtenerlo. Importa
 * `plataforma/observabilidad` (barril) para que `FiltroProblemJson` pueda inyectar `PinoLogger`;
 * `LoggerModule` ya es `@Global()` (nestjs-pino), así que no sería estrictamente necesario, pero
 * se lista igual para que el cableado quede explícito (mismo criterio que `AppModule`,
 * design.md "Módulos tocados y dependencias").
 */
@Module({
  imports: [ObservabilidadModule],
  providers: [
    {
      provide: APP_FILTER,
      useClass: FiltroProblemJson,
    },
  ],
})
export class ErroresModule {}
