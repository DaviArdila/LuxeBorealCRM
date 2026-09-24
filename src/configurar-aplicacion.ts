import type { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

/**
 * Cableado de arranque reutilizable (D14 de `design.md`): logger de pino y apagado ordenado.
 * `main.ts` y el test e2e (`test/e2e/aplicacion.e2e-spec.ts`) llaman esta misma función, para que
 * el e2e pruebe exactamente el mismo cableado que producción.
 */
export function configurarAplicacion(app: INestApplication): void {
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}
