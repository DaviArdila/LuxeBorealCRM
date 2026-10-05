import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configurarAplicacion, OPCIONES_APLICACION } from './configurar-aplicacion.js';
import { CONFIGURACION, cargarArchivoEntorno } from './plataforma/config/index.js';
import type { Configuracion } from './plataforma/config/index.js';

/**
 * Único punto de arranque (D14). `cargarArchivoEntorno()` carga `.env` antes de construir la
 * app (fuera de producción); `bufferLogs: true` retiene los logs de arranque hasta que
 * `configurarAplicacion` instala el logger de pino, para no perderlos ni usar la consola.
 * `OPCIONES_APLICACION` (`rawBody: true`, D2 de la Fase 04) es la misma constante que usan el
 * script de contrato y los tests, para que todos arranquen con el cableado exacto de producción.
 */
async function bootstrap(): Promise<void> {
  cargarArchivoEntorno();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    ...OPCIONES_APLICACION,
  });
  configurarAplicacion(app);
  const configuracion = app.get<Configuracion>(CONFIGURACION);
  await app.listen(configuracion.PORT);
}

await bootstrap();
