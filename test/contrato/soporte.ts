import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import { AppModule } from '../../src/app.module.js';
import { configurarAplicacion } from '../../src/configurar-aplicacion.js';
import { CONFIGURACION, type Configuracion } from '../../src/plataforma/config/index.js';
import { ContratoFixtureModule } from './fixture/contrato-fixture.module.js';

/**
 * Configuración literal para los tests de `test/contrato/` (D3 de `design.md`). Ninguna ruta del
 * fixture ni del pipeline de T2 abre una conexión real a Postgres o Redis (A1: los providers de
 * `plataforma/prisma`/`plataforma/redis` conectan perezosamente), así que las URLs solo necesitan
 * cumplir el formato que exige `esquemaConfiguracion` — no hace falta Testcontainers ni
 * `globalSetup` (Testing Strategy de `design.md`).
 */
export function configuracionDeContrato(): Configuracion {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgresql://usuario:clave@localhost:5432/inexistente',
    REDIS_URL: 'redis://localhost:6379/0',
    HEALTH_TIMEOUT_MS: 1500,
    DOCS_HABILITADO: false,
  };
}

/**
 * Arranca `AppModule + ContratoFixtureModule` con el mismo cableado de producción
 * (`configurarAplicacion`, D3, D6 de T4) para los tests de `test/contrato/`: el prefijo
 * `/api/v1` (con la exclusión de `/health`) y el montaje condicional de `/docs` ya viven dentro
 * de `configurarAplicacion`, así que este harness no repite `setGlobalPrefix` por su cuenta.
 */
export async function crearAplicacionDeContrato(): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({
    imports: [AppModule, ContratoFixtureModule],
  })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDeContrato())
    .compile();

  const app = modulo.createNestApplication();
  configurarAplicacion(app);
  await app.init();
  return app;
}

/** `app.getHttpServer()` está tipado `any`; este helper lo tipa una sola vez (mismo patrón que `test/e2e`). */
export function obtenerServidorDePrueba(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}
