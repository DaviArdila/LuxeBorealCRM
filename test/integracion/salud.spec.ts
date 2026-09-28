import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIGURACION, ConfiguracionModule, type Configuracion } from '../../src/plataforma/config/index.js';
import { SaludModule } from '../../src/plataforma/salud/index.js';
import { IndicadorPostgres } from '../../src/plataforma/salud/indicador-postgres.js';
import { IndicadorRedis } from '../../src/plataforma/salud/indicador-redis.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../soporte/infraestructura.js';

/**
 * Indicadores de salud de Postgres y Redis (T9, PLT4, D13): "up" contra los contenedores reales
 * de Testcontainers, "down" contra un puerto sin servicio, con respuesta rápida y sin exponer el
 * mensaje de la excepción original. Los escenarios completos con código HTTP (200/503) y el
 * cuerpo íntegro de la respuesta viven en `test/e2e/aplicacion.e2e-spec.ts`.
 */
describe('Indicadores de salud (T9, integración)', () => {
  let cerrarModulo: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cerrarModulo?.();
    cerrarModulo = undefined;
  });

  async function compilarConConfiguracion(configuracionDePrueba: Configuracion) {
    const modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, SaludModule] })
      .overrideProvider(CONFIGURACION)
      .useValue(configuracionDePrueba)
      .compile();
    cerrarModulo = () => modulo.close();
    return modulo;
  }

  it('el indicador de postgres responde "up" contra el contenedor real', async () => {
    const modulo = await compilarConConfiguracion({
      NODE_ENV: 'test',
      PORT: 3000,
      LOG_LEVEL: 'silent',
      DATABASE_URL: urlPostgresDePrueba(),
      REDIS_URL: urlRedisDePrueba(),
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
      COLAS_TRABAJADORES: true,
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
    });

    const resultado = await modulo.get(IndicadorPostgres).comprobar();

    expect(resultado.postgres?.status).toBe('up');
  });

  it('el indicador de postgres responde "down" contra un puerto sin servicio, sin exponer el error', async () => {
    const modulo = await compilarConConfiguracion({
      NODE_ENV: 'test',
      PORT: 3000,
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgresql://usuario:clave@127.0.0.1:65533/basedatos',
      REDIS_URL: urlRedisDePrueba(),
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
      COLAS_TRABAJADORES: true,
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
    });

    const inicio = performance.now();
    const resultado = await modulo.get(IndicadorPostgres).comprobar();
    const duracionMs = performance.now() - inicio;

    expect(resultado.postgres?.status).toBe('down');
    expect(JSON.stringify(resultado)).not.toMatch(/usuario|clave|ECONNREFUSED|postgresql:\/\//i);
    expect(duracionMs).toBeLessThan(1500);
  });

  it('el indicador de redis responde "up" contra el contenedor real', async () => {
    const modulo = await compilarConConfiguracion({
      NODE_ENV: 'test',
      PORT: 3000,
      LOG_LEVEL: 'silent',
      DATABASE_URL: urlPostgresDePrueba(),
      REDIS_URL: urlRedisDePrueba(),
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
      COLAS_TRABAJADORES: true,
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
    });

    const resultado = await modulo.get(IndicadorRedis).comprobar();

    expect(resultado.redis?.status).toBe('up');
  });

  it('el indicador de redis responde "down" contra un puerto sin servicio, sin exponer el error', async () => {
    const modulo = await compilarConConfiguracion({
      NODE_ENV: 'test',
      PORT: 3000,
      LOG_LEVEL: 'silent',
      DATABASE_URL: urlPostgresDePrueba(),
      REDIS_URL: 'redis://127.0.0.1:65534',
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
      COLAS_TRABAJADORES: true,
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
    });

    const inicio = performance.now();
    const resultado = await modulo.get(IndicadorRedis).comprobar();
    const duracionMs = performance.now() - inicio;

    expect(resultado.redis?.status).toBe('down');
    expect(JSON.stringify(resultado)).not.toMatch(/ECONNREFUSED|redis:\/\//i);
    expect(duracionMs).toBeLessThan(1500);
  });
});
