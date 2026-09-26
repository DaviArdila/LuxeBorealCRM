import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configurarAplicacion } from '../../src/configurar-aplicacion.js';
import { CONFIGURACION, type Configuracion } from '../../src/plataforma/config/index.js';

/**
 * Nota de nombre de archivo: mismo motivo que `documento-interno.spec.ts` — `.e2e-spec.ts` dentro
 * de `test/contrato/` no lo recoge ningún proyecto de Vitest (`vitest.config.ts`).
 */
function configuracion(docsHabilitado: boolean): Configuracion {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgresql://usuario:clave@localhost:5432/inexistente',
    REDIS_URL: 'redis://localhost:6379/0',
    HEALTH_TIMEOUT_MS: 1500,
    DOCS_HABILITADO: docsHabilitado,
    MINIO_ENDPOINT: 'localhost',
    MINIO_PUERTO: 9000,
    MINIO_SSL: false,
    MINIO_ACCESS_KEY: 'luxe',
    MINIO_SECRET_KEY: 'luxeclave',
    MINIO_BUCKET: 'luxeboreal-medios',
    MINIO_URL_PUBLICA: undefined,
    CATALOGO_SHEET_ID: undefined,
  };
}

async function crearAplicacion(docsHabilitado: boolean): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracion(docsHabilitado))
    .compile();

  const app = modulo.createNestApplication();
  configurarAplicacion(app);
  await app.init();
  return app;
}

function servidor(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

describe('API9 — /docs con Scalar (D7)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('API9 — /docs protegido fuera de desarrollo: DOCS_HABILITADO=false (default) responde 404', async () => {
    app = await crearAplicacion(false);

    const respuesta = await request(servidor(app)).get('/docs');

    expect(respuesta.status).toBe(404);
  });

  it('API9 — /docs accesible en desarrollo: DOCS_HABILITADO=true sirve el documento público con Scalar', async () => {
    app = await crearAplicacion(true);

    const respuesta = await request(servidor(app)).get('/docs');

    expect(respuesta.status).toBe(200);
    expect(respuesta.type).toBe('text/html');
  });
});
