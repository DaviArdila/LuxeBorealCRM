import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';

declare module 'vitest' {
  export interface ProvidedContext {
    urlPostgresAdmin: string;
    urlRedisAdmin: string;
  }
}

interface ContextoGlobalSetup {
  provide: <Clave extends keyof import('vitest').ProvidedContext>(
    clave: Clave,
    valor: import('vitest').ProvidedContext[Clave],
  ) => void;
}

/**
 * `globalSetup` de Vitest para los proyectos `integracion` y `e2e` (D1 de
 * `openspec/changes/fase-00a-esqueleto/design.md`): levanta Postgres 16 y Redis 7 reales con
 * Testcontainers una sola vez por corrida de cada proyecto y expone la URL **de administración**
 * de cada contenedor vía `provide(...)`. `test/soporte/infraestructura.ts` es el único lugar
 * donde un test lee esas URLs (`inject(...)`).
 *
 * Aislamiento por worker (D1): en 00a ningún test escribe datos (solo `SELECT 1` / `PING`), así
 * que todos los workers comparten un único contenedor de cada tipo; la base de datos aislada por
 * worker (`CREATE DATABASE test_<poolId>` + migraciones) y el prefijo de claves de Redis son
 * alcance de la Fase 01 — se construyen sobre este mismo arnés sin cambiar los tests.
 */
export default async function setup(
  contexto: ContextoGlobalSetup,
): Promise<() => Promise<void>> {
  const contenedorPostgres: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:16-alpine',
  ).start();
  const contenedorRedis: StartedRedisContainer = await new RedisContainer('redis:7-alpine').start();

  contexto.provide('urlPostgresAdmin', contenedorPostgres.getConnectionUri());
  contexto.provide('urlRedisAdmin', contenedorRedis.getConnectionUrl());

  return async () => {
    await Promise.all([contenedorPostgres.stop(), contenedorRedis.stop()]);
  };
}
