import { RequestMethod, StandardSchemaValidationPipe, type INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { montarDocumentacion } from './plataforma/documentacion/index.js';
import { fabricaErrorValidacion } from './plataforma/errores/index.js';

/**
 * Cableado de arranque reutilizable (D14 de `design.md` de 00a; D5 de 00b, T2; D6/D7 de 00b, T4):
 * logger de pino, prefijo global con la exención de `/health` (API2, D6), pipe de validación
 * global (soporte nativo de NestJS 12), documentación en `/docs` (D7) y apagado ordenado.
 * `main.ts`, `scripts/generar-contrato.ts` y el test e2e (`test/e2e/aplicacion.e2e-spec.ts`) llaman
 * esta misma función, para que la generación del contrato y el e2e prueben exactamente el mismo
 * cableado que producción.
 *
 * `exceptionFactory: fabricaErrorValidacion` (checkpoint (b) de `tasks.md`): en vez de dejar que
 * el pipe arme su `BadRequestException` por defecto (aplana cada issue a una cadena y pierde la
 * estructura), construye directamente un `ErrorDeAplicacion('validacion-fallida', ...)` que
 * `FiltroProblemJson` (D5) traduce a `problem+json`.
 */
export function configurarAplicacion(app: INestApplication): void {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(new StandardSchemaValidationPipe({ exceptionFactory: fabricaErrorValidacion }));
  montarDocumentacion(app);
  app.enableShutdownHooks();
}
