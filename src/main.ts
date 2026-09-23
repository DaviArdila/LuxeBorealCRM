import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

// Trivial por diseño (T2, design.md "Archivos/áreas"): cargarArchivoEntorno(),
// configurarAplicacion(app) y el resto del cableado de arranque llegan en T9 (D14).
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}

await bootstrap();
