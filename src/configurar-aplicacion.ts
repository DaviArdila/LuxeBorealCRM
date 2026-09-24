import { StandardSchemaValidationPipe, type INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { fabricaErrorValidacion } from './plataforma/errores/index.js';

/**
 * Cableado de arranque reutilizable (D14 de `design.md` de 00a; D5 de 00b, T2): logger de pino,
 * pipe de validación global (soporte nativo de NestJS 12) y apagado ordenado. `main.ts` y el
 * test e2e (`test/e2e/aplicacion.e2e-spec.ts`) llaman esta misma función, para que el e2e pruebe
 * exactamente el mismo cableado que producción.
 *
 * `exceptionFactory: fabricaErrorValidacion` (checkpoint (b) de `tasks.md`): en vez de dejar que
 * el pipe arme su `BadRequestException` por defecto (aplana cada issue a una cadena y pierde la
 * estructura), construye directamente un `ErrorDeAplicacion('validacion-fallida', ...)` que
 * `FiltroProblemJson` (D5) traduce a `problem+json`.
 */
export function configurarAplicacion(app: INestApplication): void {
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new StandardSchemaValidationPipe({ exceptionFactory: fabricaErrorValidacion }));
  app.enableShutdownHooks();
}
