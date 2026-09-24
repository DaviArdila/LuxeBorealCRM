import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
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
    };

    const modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, RedisModule] })
      .overrideProvider(CONFIGURACION)
      .useValue(configuracionDePrueba)
      .compile();
    cerrarModulo = () => modulo.close();

    const cliente = modulo.get<ClienteRedis>(REDIS_CLIENTE);
    // `lazyConnect: true` + `enableOfflineQueue: false` (D12): sin cola offline, el primer
    // comando emitido mientras el socket todavía se está conectando se rechaza en vez de
    // esperar. `connect()` es idempotente (resuelve de inmediato si ya está conectado o
    // conectando) — así es como el indicador de salud de T9 MUST abrir la conexión antes de su
    // primer PING real.
    await cliente.connect();
    const respuesta = await cliente.ping();

    expect(respuesta).toBe('PONG');
  });
});
