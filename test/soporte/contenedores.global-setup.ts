import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { Client } from 'pg';
import { NOMBRE_PLANTILLA, urlConBase } from './bases-de-prueba.js';
import { ejecutarPrismaCli } from './prisma-cli.js';

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
 * `openspec/changes/fase-00a-esqueleto/design.md`; D6 de
 * `openspec/changes/fase-01-persistencia/design.md`): levanta Postgres 16 y Redis 7 reales con
 * Testcontainers una sola vez por corrida de cada proyecto, crea y migra la base **plantilla**
 * (`plantilla_luxe`) una sola vez, y expone la URL **de administración** de cada contenedor vía
 * `provide(...)`. `test/soporte/infraestructura.ts` es el único lugar donde un test lee esas URLs
 * (`inject(...)`); `test/soporte/base-por-worker.setup.ts` clona `plantilla_luxe` en
 * `test_<poolId>` antes de cada archivo de test.
 *
 * Con cero migraciones todavía (T1 de `fase-01-persistencia`), la plantilla queda creada pero sin
 * migrar: `prisma migrate deploy` se omite si `prisma/migrations/` no existe o está vacía.
 */
export default async function setup(
  contexto: ContextoGlobalSetup,
): Promise<() => Promise<void>> {
  const contenedorPostgres: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:16-alpine',
  ).start();
  const contenedorRedis: StartedRedisContainer = await new RedisContainer('redis:7-alpine').start();

  const urlAdmin = contenedorPostgres.getConnectionUri();
  await crearYMigrarPlantilla(urlAdmin);

  contexto.provide('urlPostgresAdmin', urlAdmin);
  contexto.provide('urlRedisAdmin', contenedorRedis.getConnectionUrl());

  return async () => {
    await Promise.all([contenedorPostgres.stop(), contenedorRedis.stop()]);
  };
}

async function crearYMigrarPlantilla(urlAdmin: string): Promise<void> {
  const cliente = new Client({ connectionString: urlAdmin });
  await cliente.connect();
  try {
    await cliente.query(`DROP DATABASE IF EXISTS "${NOMBRE_PLANTILLA}" WITH (FORCE)`);
    await cliente.query(`CREATE DATABASE "${NOMBRE_PLANTILLA}" TEMPLATE "template0"`);
  } finally {
    await cliente.end();
  }

  if (!hayMigraciones()) {
    return;
  }

  const urlPlantilla = urlConBase(urlAdmin, NOMBRE_PLANTILLA);
  const resultado = await ejecutarPrismaCli(['migrate', 'deploy'], urlPlantilla);
  if (resultado.codigo !== 0) {
    throw new Error(
      `prisma migrate deploy sobre "${NOMBRE_PLANTILLA}" terminó con código ${resultado.codigo}:\n` +
        `${resultado.salida}\n${resultado.error}`,
    );
  }
}

function hayMigraciones(): boolean {
  const carpetaMigraciones = path.resolve(import.meta.dirname, '..', '..', 'prisma', 'migrations');
  return existsSync(carpetaMigraciones) && readdirSync(carpetaMigraciones).length > 0;
}
