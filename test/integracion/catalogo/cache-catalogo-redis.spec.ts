import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CONFIGURACION,
  ConfiguracionModule,
  type Configuracion,
} from '../../../src/plataforma/config/index.js';
import { RedisModule, REDIS_CLIENTE, type ClienteRedis } from '../../../src/plataforma/redis/index.js';
import { CacheCatalogoRedis } from '../../../src/modulos/catalogo/infraestructura/cache-catalogo-redis.js';
import type { ProductoResumen } from '../../../src/modulos/catalogo/dominio/producto.js';
import { ClockFalso } from '../../fakes/clock-falso.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

const CLAVE_VERSION = 'catalogo:version';

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearCliente(): Promise<ClienteRedis> {
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
  };

  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, RedisModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba)
    .compile();

  return modulo.get(REDIS_CLIENTE);
}

function productoResumen(id: string, nombre: string): ProductoResumen {
  return { id, sku: `SKU-${id}`, nombre, descripcionCorta: 'descripción' };
}

/**
 * Limpia `catalogo:version` antes de cada test: el contenedor Redis de Testcontainers se comparte
 * entre archivos de test de este proyecto (`vitest.config.ts`, `globalSetup`), pero ningún otro
 * archivo escribe esta clave todavía, así que un `DEL` propio basta para que cada test parta de
 * "sin versión" sin depender de un prefijo por worker.
 */
async function limpiarVersion(cliente: ClienteRedis): Promise<void> {
  if (cliente.status === 'wait' || cliente.status === 'close' || cliente.status === 'end') {
    await cliente.connect();
  }
  await cliente.del(CLAVE_VERSION);
}

describe('Caché de catálogo Redis (T7, integración)', () => {
  let cliente: ClienteRedis;

  beforeEach(async () => {
    cliente = await crearCliente();
    await limpiarVersion(cliente);
  });

  it('CAT4 — Una escritura directa en producto sin pasar por la invalidación no se refleja de inmediato', async () => {
    const clock = new ClockFalso(new Date('2026-09-26T12:00:00Z'));
    const cache = new CacheCatalogoRedis(cliente, clock);
    const copiaOriginal = [productoResumen('1', 'Alfombra')];

    await cache.reemplazar(copiaOriginal);
    expect(await cache.obtenerVigente()).toEqual(copiaOriginal);

    // "Escritura directa" simulada: aparecería un producto nuevo en el origen de datos, pero nadie
    // llamó a `invalidar()` para avisarle a esta copia.
    expect(await cache.obtenerVigente()).toEqual(copiaOriginal);
  });

  it('CAT5 — Invalidar el catálogo incrementa la versión compartida', async () => {
    const clock = new ClockFalso(new Date('2026-09-26T12:00:00Z'));
    const cache = new CacheCatalogoRedis(cliente, clock);
    const antes = Number((await cliente.get(CLAVE_VERSION)) ?? '0');

    await cache.invalidar();

    expect(Number(await cliente.get(CLAVE_VERSION))).toBe(antes + 1);
  });

  it('CAT5 — Invalidar el catálogo hace que la siguiente lectura vea el cambio de inmediato', async () => {
    const clock = new ClockFalso(new Date('2026-09-26T12:00:00Z'));
    const cache = new CacheCatalogoRedis(cliente, clock);
    const copiaOriginal = [productoResumen('1', 'Alfombra')];
    await cache.reemplazar(copiaOriginal);
    expect(await cache.obtenerVigente()).toEqual(copiaOriginal);

    await cache.invalidar();

    expect(await cache.obtenerVigente()).toBeNull();

    const copiaActualizada = [productoResumen('1', 'Alfombra'), productoResumen('2', 'Banco')];
    await cache.reemplazar(copiaActualizada);
    expect(await cache.obtenerVigente()).toEqual(copiaActualizada);
  });

  it('CAT5 — Otro proceso que incrementa la versión compartida invalida esta copia igual', async () => {
    const clock = new ClockFalso(new Date('2026-09-26T12:00:00Z'));
    // Misma conexión Redis real, dos instancias del adaptador: simula dos procesos que comparten
    // la clave de versión (`catalogo:version`) sin compartir estado de instancia entre sí.
    const cacheDeEsteProceso = new CacheCatalogoRedis(cliente, clock);
    const cacheDeOtroProceso = new CacheCatalogoRedis(cliente, clock);
    const copiaOriginal = [productoResumen('1', 'Alfombra')];
    await cacheDeEsteProceso.reemplazar(copiaOriginal);
    expect(await cacheDeEsteProceso.obtenerVigente()).toEqual(copiaOriginal);

    await cacheDeOtroProceso.invalidar();

    expect(await cacheDeEsteProceso.obtenerVigente()).toBeNull();
  });
});
