import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { urlPostgresDePrueba } from '../../soporte/infraestructura.js';

const MIGRACION = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'prisma',
  'migrations',
  '20261006120000_version_estilo',
  'migration.sql',
);

interface FilaVersion {
  readonly version: number;
  readonly texto: string;
  readonly vigente: boolean;
  readonly publicado_en: Date;
  readonly publicado_por_id: string | null;
  readonly id: string;
}

/**
 * EST-D4 (Fase 12, T3): la migración copia el estilo de `parametro` a `version_estilo`. Se ejecuta el SQL real
 * de la migración sobre la base del arnés (ya migrada): dentro de una transacción se retira la tabla, se siembran
 * las claves viejas de `parametro`, se corre el archivo y se inspecciona; todo se deshace al final.
 */
async function conMigracion<T>(
  parametros: Readonly<Record<string, unknown>>,
  inspeccionar: (cliente: Client) => Promise<T>,
): Promise<T> {
  const cliente = new Client({ connectionString: urlPostgresDePrueba() });
  await cliente.connect();
  try {
    await cliente.query('BEGIN');
    try {
      await cliente.query('DROP TABLE "version_estilo"');
      await cliente.query(`DELETE FROM parametro WHERE clave LIKE 'prompt_estilo%'`);
      for (const [clave, valor] of Object.entries(parametros)) {
        await cliente.query(`INSERT INTO parametro (clave, valor, actualizado) VALUES ($1, $2::jsonb, '2026-10-04T09:00:00Z')`, [
          clave,
          JSON.stringify(valor),
        ]);
      }
      await cliente.query(readFileSync(MIGRACION, 'utf8'));
      return await inspeccionar(cliente);
    } finally {
      await cliente.query('ROLLBACK');
    }
  } finally {
    await cliente.end();
  }
}

async function leerVersiones(cliente: Client): Promise<FilaVersion[]> {
  const resultado = await cliente.query<FilaVersion>(
    'SELECT id, version, texto, vigente, publicado_en, publicado_por_id FROM "version_estilo" ORDER BY version',
  );
  return resultado.rows;
}

describe('Migración version_estilo (Fase 12, T3, integración)', () => {
  it('EST-D4 — La migración conserva el vigente y el historial con sus números y textos', async () => {
    const filas = await conMigracion(
      {
        prompt_estilo: 'Estilo cinco.',
        prompt_estilo_version: 5,
        prompt_estilo_historial: [
          { version: 4, texto: 'Estilo cuatro.', fecha: '2026-10-04T08:00:00.000Z' },
          { version: 3, texto: 'Estilo tres.', fecha: '2026-10-03T08:00:00.000Z' },
          { version: 2, texto: 'Estilo dos.', fecha: '2026-10-02T08:00:00.000Z' },
          { version: 1, texto: 'Estilo uno.', fecha: '2026-10-01T08:00:00.000Z' },
        ],
      },
      leerVersiones,
    );

    expect(filas.map((f) => [f.version, f.texto, f.vigente])).toEqual([
      [1, 'Estilo uno.', false],
      [2, 'Estilo dos.', false],
      [3, 'Estilo tres.', false],
      [4, 'Estilo cuatro.', false],
      [5, 'Estilo cinco.', true],
    ]);
    // La fecha en que dejó de regir una versión (AGT21) es la de publicación de la siguiente.
    expect(filas.map((f) => f.publicado_en.toISOString())).toEqual([
      '2026-10-01T08:00:00.000Z',
      '2026-10-01T08:00:00.000Z',
      '2026-10-02T08:00:00.000Z',
      '2026-10-03T08:00:00.000Z',
      '2026-10-04T08:00:00.000Z',
    ]);
    expect(filas.every((f) => f.publicado_por_id === null)).toBe(true);
    expect(filas.every((f) => /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(f.id))).toBe(true);
  });

  it('EST-D4 — Sin estilo guardado la migración no crea filas', async () => {
    const filas = await conMigracion({}, leerVersiones);

    expect(filas).toEqual([]);
  });

  it('EST-D4 — Las tres claves viejas siguen en parametro después de la migración', async () => {
    const claves = await conMigracion(
      { prompt_estilo: 'Estilo uno.', prompt_estilo_version: 1, prompt_estilo_historial: [] },
      async (cliente) => {
        const resultado = await cliente.query<{ clave: string }>(
          `SELECT clave FROM parametro WHERE clave LIKE 'prompt_estilo%' ORDER BY clave`,
        );
        return resultado.rows.map((fila) => fila.clave);
      },
    );

    expect(claves).toEqual(['prompt_estilo', 'prompt_estilo_historial', 'prompt_estilo_version']);
  });

  it('un estilo editado a mano sin versión se migra como versión 1 con la fecha en que se guardó', async () => {
    const filas = await conMigracion({ prompt_estilo: 'Editado a mano.' }, leerVersiones);

    expect(filas.map((f) => [f.version, f.vigente, f.publicado_en.toISOString()])).toEqual([
      [1, true, '2026-10-04T09:00:00.000Z'],
    ]);
  });

  it('un historial dañado o con entradas inválidas se ignora sin romper la migración', async () => {
    const filas = await conMigracion(
      {
        prompt_estilo: 'Estilo tres.',
        prompt_estilo_version: 3,
        prompt_estilo_historial: [
          { version: 2, texto: 'Estilo dos.', fecha: '2026-10-02T08:00:00.000Z' },
          { version: 'x', texto: 'sin número', fecha: '2026-10-01T08:00:00.000Z' },
          { version: 1, texto: 7, fecha: '2026-10-01T08:00:00.000Z' },
          'no es un objeto',
        ],
      },
      leerVersiones,
    );
    const danado = await conMigracion({ prompt_estilo: 'Estilo uno.', prompt_estilo_historial: 'no es un arreglo' }, leerVersiones);

    expect(filas.map((f) => f.version)).toEqual([2, 3]);
    expect(danado.map((f) => f.version)).toEqual([1]);
  });

  it('EST-D1 — Tras la migración la base rechaza una segunda versión vigente', async () => {
    const rechazo = await conMigracion(
      { prompt_estilo: 'Estilo dos.', prompt_estilo_version: 2, prompt_estilo_historial: [{ version: 1, texto: 'Estilo uno.', fecha: '2026-10-01T08:00:00.000Z' }] },
      async (cliente) => {
        await cliente.query('SAVEPOINT intento');
        try {
          await cliente.query('UPDATE "version_estilo" SET vigente = true WHERE version = 1');
          return null;
        } catch (error) {
          return (error as { code?: string }).code ?? null;
        }
      },
    );

    expect(rechazo).toBe('23505');
  });
});
