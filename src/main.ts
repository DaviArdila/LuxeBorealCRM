import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configurarAplicacion } from './configurar-aplicacion.js';
import { CONFIGURACION, cargarArchivoEntorno } from './plataforma/config/index.js';
import type { Configuracion } from './plataforma/config/index.js';

/**
 * Único punto de arranque (D14). `cargarArchivoEntorno()` carga `.env` antes de construir la
 * app (fuera de producción); `bufferLogs: true` retiene los logs de arranque hasta que
 * `configurarAplicacion` instala el logger de pino, para no perderlos ni usar la consola.
 */
async function bootstrap(): Promise<void> {
  cargarArchivoEntorno();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configurarAplicacion(app);
  const configuracion = app.get<Configuracion>(CONFIGURACION);
  await app.listen(configuracion.PORT);
}

await bootstrap();
