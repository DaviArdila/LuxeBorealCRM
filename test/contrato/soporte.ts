import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import { AppModule } from '../../src/app.module.js';
import { configurarAplicacion } from '../../src/configurar-aplicacion.js';
import { CONFIGURACION, type Configuracion } from '../../src/plataforma/config/index.js';
import { ContratoFixtureModule } from './fixture/contrato-fixture.module.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../soporte/configuracion-llm-de-prueba.js';

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
    MINIO_ENDPOINT: 'localhost',
    MINIO_PUERTO: 9000,
    MINIO_SSL: false,
    MINIO_ACCESS_KEY: 'luxe',
    MINIO_SECRET_KEY: 'luxeclave',
    MINIO_BUCKET: 'luxeboreal-medios',
    MINIO_URL_PUBLICA: undefined,
    CATALOGO_SHEET_ID: undefined,
    CHATWOOT_URL: 'http://localhost:3001',
    CHATWOOT_ACCOUNT_ID: 1,
    CHATWOOT_BOT_TOKEN: '',
    CHATWOOT_WEBHOOK_SECRETO: '',
    CHATWOOT_WEBHOOK_TOLERANCIA_S: 300,
    CHATWOOT_HTTP_TIMEOUT_MS: 10000,
    COLAS_PREFIJO: 'luxe:colas',
    // Sin Redis real en este contexto (D6): registra la cola pero nunca arranca un worker.
    COLAS_TRABAJADORES: false,
    INBOX_MAX_INTENTOS: 5,
    INBOX_BARRIDO_MS: 30000,
    OUTBOX_MAX_INTENTOS: 5,
    OUTBOX_BACKOFF_BASE_S: 15,
    OUTBOX_BACKOFF_MAX_S: 300,
    OUTBOX_BARRIDO_MS: 5000,
    OUTBOX_LEASE_S: 60,
    HUMANO_TTL_HORAS: 3,
    HANDOFF_TTL_MIN: 45,
    LOCK_TURNO_TTL_S: 30,
    RATE_LIMIT_POR_HORA: 20,
    RATE_LIMIT_POR_DIA: 60,
    DEBOUNCE_MS: 3000,
    CONVERSACIONES_CONCURRENCIA: 10,
    CONVERSACIONES_BARRIDO_MS: 300000,
    HANDOFF_ESPERA_MIN: 30,
    ...CONFIGURACION_AGENTE_DE_PRUEBA,
    ...CONFIGURACION_LLM_DE_PRUEBA,
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

  const app = modulo.createNestApplication<NestExpressApplication>();
  configurarAplicacion(app);
  await app.init();
  return app;
}

/** `app.getHttpServer()` está tipado `any`; este helper lo tipa una sola vez (mismo patrón que `test/e2e`). */
export function obtenerServidorDePrueba(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}
