import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIGURACION, ConfiguracionModule, type Configuracion } from '../../src/plataforma/config/index.js';
import { REDIS_CLIENTE, RedisModule, type ClienteRedis } from '../../src/plataforma/redis/index.js';
import { PrismaModule, PrismaService } from '../../src/plataforma/prisma/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../soporte/infraestructura.js';

/**
 * Smoke de infraestructura de T8 (design.md, "RED → GREEN → REFACTOR" de T8): confirma que
 * `PrismaService` conecta y ejecuta `$queryRaw` contra el Postgres real de Testcontainers, y que
 * el cliente Redis de plataforma responde `PING`. No cubre ningún escenario de negocio (T9 prueba
 * los indicadores de salud reales); es la base de infraestructura que T9 necesita.
 */
describe('Infraestructura Prisma + Redis (T8, integración)', () => {
  let cerrarModulo: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cerrarModulo?.();
    cerrarModulo = undefined;
  });

  it('PrismaService ejecuta $queryRaw SELECT 1 contra Postgres real', async () => {
    const configuracionDePrueba: Configuracion = {
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
      DEBOUNCE_MS: 3000,
      CONVERSACIONES_CONCURRENCIA: 10,
      CONVERSACIONES_BARRIDO_MS: 300000,
      HANDOFF_ESPERA_MIN: 30,
    };

    const modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule] })
      .overrideProvider(CONFIGURACION)
      .useValue(configuracionDePrueba)
      .compile();
    cerrarModulo = () => modulo.close();

    const prisma = modulo.get(PrismaService);
    const resultado = await prisma.$queryRaw<{ resultado: number }[]>`SELECT 1 AS resultado`;

    expect(resultado).toEqual([{ resultado: 1 }]);
  });

  it('el cliente Redis de plataforma responde PING contra Redis real', async () => {
    const configuracionDePrueba: Configuracion = {
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
      DEBOUNCE_MS: 3000,
      CONVERSACIONES_CONCURRENCIA: 10,
      CONVERSACIONES_BARRIDO_MS: 300000,
      HANDOFF_ESPERA_MIN: 30,
    };

    const modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, RedisModule] })
      .overrideProvider(CONFIGURACION)
      .useValue(configuracionDePrueba)
      .compile();
    cerrarModulo = () => modulo.close();

    const cliente = modulo.get<ClienteRedis>(REDIS_CLIENTE);
    // `lazyConnect: true` + `enableOfflineQueue: false` (D12): sin cola offline, el primer
    // comando emitido mientras el socket todavía se está conectando se rechaza en vez de
    // esperar. `connect()` NO es idempotente — rechaza con "Redis is already
    // connecting/connected" si el estado ya es `connecting`/`connect`/`ready` (verificado en
    // `node_modules/ioredis/built/Redis.js`, `_connect()`) — así que el indicador de salud de T9
    // MUST comprobar `cliente.status` antes de llamar `connect()` en cada chequeo, no llamarlo
    // sin condición.
    await cliente.connect();
    const respuesta = await cliente.ping();

    expect(respuesta).toBe('PONG');
  });

  it('el cierre del módulo no lanza cuando el cliente Redis nunca se conectó', async () => {
    const configuracionDePrueba: Configuracion = {
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
      DEBOUNCE_MS: 3000,
      CONVERSACIONES_CONCURRENCIA: 10,
      CONVERSACIONES_BARRIDO_MS: 300000,
      HANDOFF_ESPERA_MIN: 30,
    };

    const modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, RedisModule] })
      .overrideProvider(CONFIGURACION)
      .useValue(configuracionDePrueba)
      .compile();

    // Nunca se llama cliente.connect() ni ningún comando: el estado sigue siendo `wait`. Nest
    // atrapa cualquier excepción de `onApplicationShutdown` y solo la loguea con `Logger.error`
    // (no rechaza `close()`, `node_modules/@nestjs/core/hooks/on-app-shutdown.hook.js`) — así que
    // la señal real de este bug es un error logueado en cada apagado, no un `close()` que falla.
    const errorEspiado = vi.spyOn(Logger, 'error').mockImplementation(() => undefined);
    try {
      await modulo.close();
      expect(errorEspiado).not.toHaveBeenCalled();
    } finally {
      errorEspiado.mockRestore();
    }
  });
});
