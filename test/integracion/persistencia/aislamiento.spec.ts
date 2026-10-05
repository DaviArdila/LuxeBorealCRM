import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect, inject, it } from 'vitest';
import { NOMBRE_PLANTILLA, identificadorDeWorker, nombreBaseDeWorker, urlConBase } from '../../soporte/bases-de-prueba.js';
import { urlPostgresDePrueba } from '../../soporte/infraestructura.js';

/**
 * PER10 (`specs/persistencia/spec.md`; T1 de `tasks.md`, D6 de `design.md`): cada worker de
 * Vitest corre sus tests de integración contra su propia base `test_<poolId>_<pid>`, clonada de la
 * plantilla ya migrada por `contenedores.global-setup.ts` y recreada por `base-por-worker.setup.ts`
 * antes de este archivo. Los títulos de `it(...)` son literales de los encabezados
 * `#### Scenario:` de la spec, sin parafrasear (nota de implementación de la spec, lección de
 * `verify-report.md` de la Fase 00b).
 */
describe('Aislamiento de bases de prueba por worker (T1, integración)', () => {
  it('PER10 — Cada worker de pruebas usa su propia base de datos clonada de la plantilla', async () => {
    const nombreEsperado = nombreBaseDeWorker(identificadorDeWorker(process.env.VITEST_POOL_ID ?? '', process.pid));
    const urlPropia = urlPostgresDePrueba();

    expect(new URL(urlPropia).pathname).toBe(`/${nombreEsperado}`);

    const cliente = new Client({ connectionString: urlPropia });
    await cliente.connect();
    try {
      const resultado = await cliente.query<{ base: string }>('SELECT current_database() AS base');
      expect(resultado.rows[0]?.base).toBe(nombreEsperado);
    } finally {
      await cliente.end();
    }
  });

  it('PER10 — Las filas escritas por un worker no son visibles para otro worker', async () => {
    const urlAdmin = inject('urlPostgresAdmin');
    // Simula la base de otro worker: un clon fresco de la plantilla, tomado ANTES de escribir
    // nada en la base propia. Si la fila del worker propio fuera visible ahí, sería porque las
    // bases no están realmente aisladas (comparten la misma base física), no porque el clon haya
    // llegado tarde.
    const nombreBaseOtroWorker = `test_otro_worker_${randomUUID().replaceAll('-', '')}`;
    const clienteAdmin = new Client({ connectionString: urlAdmin });
    await clienteAdmin.connect();

    try {
      await clienteAdmin.query(
        `CREATE DATABASE "${nombreBaseOtroWorker}" TEMPLATE "${NOMBRE_PLANTILLA}"`,
      );

      const urlPropia = urlPostgresDePrueba();
      const clientePropio = new Client({ connectionString: urlPropia });
      await clientePropio.connect();
      try {
        await clientePropio.query(
          'CREATE TABLE IF NOT EXISTS fila_de_prueba_aislamiento (id serial primary key, worker text not null)',
        );
        await clientePropio.query('INSERT INTO fila_de_prueba_aislamiento (worker) VALUES ($1)', [
          process.env.VITEST_POOL_ID ?? '',
        ]);
      } finally {
        await clientePropio.end();
      }

      const urlOtroWorker = urlConBase(urlAdmin, nombreBaseOtroWorker);
      const clienteOtroWorker = new Client({ connectionString: urlOtroWorker });
      await clienteOtroWorker.connect();
      try {
        const resultado = await clienteOtroWorker.query<{ tabla: string | null }>(
          "SELECT to_regclass('public.fila_de_prueba_aislamiento') AS tabla",
        );
        expect(resultado.rows[0]?.tabla).toBeNull();
      } finally {
        await clienteOtroWorker.end();
      }
    } finally {
      await clienteAdmin.query(`DROP DATABASE IF EXISTS "${nombreBaseOtroWorker}" WITH (FORCE)`);
      await clienteAdmin.end();
    }
    // Clona la plantilla dentro del test: es la misma operación del `beforeAll` de
    // `base-por-worker.setup.ts` y lleva su mismo presupuesto (`hookTimeout`, 60 s), no el de un test
    // individual; bajo la contención de cuatro workers en Docker Desktop superaba los 20 s.
  }, 60_000);
});
