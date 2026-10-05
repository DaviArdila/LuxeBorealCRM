import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { describe, expect, inject, it } from 'vitest';
import { urlConBase } from '../../soporte/bases-de-prueba.js';
import { ejecutarPrismaCli } from '../../soporte/prisma-cli.js';

const RAIZ_REPOSITORIO = path.resolve(import.meta.dirname, '..', '..', '..');
const RUTA_SCHEMA = path.join(RAIZ_REPOSITORIO, 'prisma', 'schema.prisma');

function registrarSalidaReal(
  comando: string,
  resultado: { readonly codigo: number; readonly salida: string; readonly error: string },
): void {
  if (process.env.LUXE_T2_EVIDENCIA_RUNTIME !== '1') return;

  process.stdout.write(`\n[T2] ${comando} (código ${resultado.codigo})\n`);
  process.stdout.write(resultado.salida);
  if (resultado.salida && !resultado.salida.endsWith('\n')) process.stdout.write('\n');
  if (resultado.error) process.stderr.write(resultado.error);
}

/**
 * PER1 (`specs/persistencia/spec.md`; T2 de `tasks.md`, D1-D4 de `design.md`): la migración
 * inicial se aplica sin errores sobre una base vacía, y el esquema resultante no tiene deriva
 * respecto a `prisma/schema.prisma`. A diferencia de los demás specs de esta fase, estos dos
 * escenarios ejercitan el propio proceso de migración (no la base del worker ya migrada por el
 * arnés de T1): crean una base realmente vacía, sin `_prisma_migrations`, para cada escenario.
 */
describe('Migración inicial (T2, integración)', () => {
  it(
    'PER1 — Migración aplicada sin errores sobre una base vacía',
    async () => {
      const urlAdmin = inject('urlPostgresAdmin');
      const nombreBaseVacia = `test_migracion_${randomUUID().replaceAll('-', '')}`;
      const clienteAdmin = new Client({ connectionString: urlAdmin });
      await clienteAdmin.connect();

      try {
        // TEMPLATE template0, no `plantilla_luxe`: esta base MUST nacer sin ninguna tabla, sin
        // `_prisma_migrations` (a diferencia de la plantilla del arnés, ya migrada por T1).
        await clienteAdmin.query(`CREATE DATABASE "${nombreBaseVacia}" TEMPLATE "template0"`);
        const urlBaseVacia = urlConBase(urlAdmin, nombreBaseVacia);

        const resultado = await ejecutarPrismaCli(['migrate', 'deploy'], urlBaseVacia);
        registrarSalidaReal('prisma migrate deploy sobre una base vacía', resultado);
        expect(resultado.codigo).toBe(0);

        const clienteBaseVacia = new Client({ connectionString: urlBaseVacia });
        await clienteBaseVacia.connect();
        try {
          const migraciones = await clienteBaseVacia.query<{
            finished_at: Date | null;
            rolled_back_at: Date | null;
          }>('SELECT finished_at, rolled_back_at FROM "_prisma_migrations"');
          expect(migraciones.rows.length).toBeGreaterThan(0);
          for (const fila of migraciones.rows) {
            expect(fila.finished_at).not.toBeNull();
            expect(fila.rolled_back_at).toBeNull();
          }
        } finally {
          await clienteBaseVacia.end();
        }
      } finally {
        await clienteAdmin.query(`DROP DATABASE IF EXISTS "${nombreBaseVacia}" WITH (FORCE)`);
        await clienteAdmin.end();
      }
    },
    90_000,
  );

  it(
    'PER1 — Esquema aplicado sin deriva respecto a schema.prisma',
    async () => {
      const urlAdmin = inject('urlPostgresAdmin');
      const nombreBaseVacia = `test_deriva_${randomUUID().replaceAll('-', '')}`;
      const clienteAdmin = new Client({ connectionString: urlAdmin });
      await clienteAdmin.connect();

      try {
        await clienteAdmin.query(`CREATE DATABASE "${nombreBaseVacia}" TEMPLATE "template0"`);
        const urlBaseVacia = urlConBase(urlAdmin, nombreBaseVacia);

        const despliegue = await ejecutarPrismaCli(['migrate', 'deploy'], urlBaseVacia);
        registrarSalidaReal('prisma migrate deploy antes de comprobar deriva', despliegue);
        expect(despliegue.codigo).toBe(0);

        // `--from-config-datasource` lee `DATABASE_URL` del entorno del subproceso (que
        // `ejecutarPrismaCli` sobrescribe con `urlBaseVacia`, D7); `prisma.config.ts` la usa como
        // datasource. Checkpoint [sin verificar] de tasks.md, D4.5: confirmado en T2 que este
        // comando da código 0 aun con las tres restricciones [manual] ya aplicadas (ver
        // `prisma/README.md`) — Prisma no ve NULLS NOT DISTINCT ni los CHECK como deriva.
        const deriva = await ejecutarPrismaCli(
          ['migrate', 'diff', '--from-config-datasource', '--to-schema', RUTA_SCHEMA, '--exit-code'],
          urlBaseVacia,
        );
        registrarSalidaReal(
          'prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code',
          deriva,
        );
        expect(deriva.codigo).toBe(0);
      } finally {
        await clienteAdmin.query(`DROP DATABASE IF EXISTS "${nombreBaseVacia}" WITH (FORCE)`);
        await clienteAdmin.end();
      }
    },
    90_000,
  );

  it(
    'T2 — prisma migrate dev valida el esquema v1 sobre una base vacía y deja los UUID sin DEFAULT en Postgres',
    async () => {
      const urlAdmin = inject('urlPostgresAdmin');
      const nombreBaseVacia = `test_dev_${randomUUID().replaceAll('-', '')}`;
      const clienteAdmin = new Client({ connectionString: urlAdmin });
      await clienteAdmin.connect();

      try {
        await clienteAdmin.query(`CREATE DATABASE "${nombreBaseVacia}" TEMPLATE "template0"`);
        const urlBaseVacia = urlConBase(urlAdmin, nombreBaseVacia);

        const migracion = await ejecutarPrismaCli(
          ['migrate', 'dev', '--name', 'verificar_esquema_v1'],
          urlBaseVacia,
        );
        registrarSalidaReal('prisma migrate dev --name verificar_esquema_v1 sobre una base vacía', migracion);
        expect(migracion.codigo).toBe(0);

        const clienteBaseVacia = new Client({ connectionString: urlBaseVacia });
        await clienteBaseVacia.connect();
        try {
          const columnasId = await clienteBaseVacia.query<{
            total: number;
            conDefault: number;
          }>(`
            SELECT
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE column_default IS NOT NULL)::int AS "conDefault"
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND data_type = 'uuid'
              AND column_name = 'id'
          `);
          expect(columnasId.rows[0]).toEqual({ total: 17, conDefault: 0 });

          const migraciones = await clienteBaseVacia.query<{ total: number }>(
            'SELECT COUNT(*)::int AS total FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
          );
          // Cuenta las migraciones aplicadas, no un número fijo (Fase 04/T6 agregó la segunda,
          // `outbox_clave_idempotencia`, sin tabla nueva): así este test no vuelve a quedar
          // desactualizado la próxima vez que una fase agregue una migración aditiva.
          const migracionesEnDisco = readdirSync(path.join(RAIZ_REPOSITORIO, 'prisma', 'migrations')).filter(
            (entrada) => entrada !== 'migration_lock.toml',
          );
          expect(migraciones.rows[0]?.total).toBe(migracionesEnDisco.length);
        } finally {
          await clienteBaseVacia.end();
        }
      } finally {
        await clienteAdmin.query(`DROP DATABASE IF EXISTS "${nombreBaseVacia}" WITH (FORCE)`);
        await clienteAdmin.end();
      }
    },
    90_000,
  );
});
