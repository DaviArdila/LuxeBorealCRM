import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { componerEstilo, dividirEstilo } from '../../../src/modulos/agente/dominio/secciones-estilo.js';
import { urlPostgresDePrueba } from '../../soporte/infraestructura.js';

const MIGRACION = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'prisma',
  'migrations',
  '20261007120000_estilo_secciones',
  'migration.sql',
);
const ESTILO_INICIAL = readFileSync(path.resolve(import.meta.dirname, '..', '..', '..', 'prisma', 'datos', 'estilo-inicial.md'), 'utf8');

interface FilaSeccion {
  readonly id: string;
  readonly titulo: string;
  readonly titulo_normalizado: string;
  readonly texto: string;
  readonly orden: number;
  readonly activo: boolean;
}

/**
 * Estilo en secciones: la migración parte el estilo vigente por sus encabezados `# `. Se ejecuta el SQL real sobre la base
 * del arnés (ya migrada): dentro de una transacción se retira la tabla, se siembra `version_estilo` y se corre el archivo;
 * todo se deshace al final.
 */
async function conMigracion<T>(versiones: readonly { texto: string; vigente: boolean }[], inspeccionar: (cliente: Client) => Promise<T>): Promise<T> {
  const cliente = new Client({ connectionString: urlPostgresDePrueba() });
  await cliente.connect();
  try {
    await cliente.query('BEGIN');
    try {
      await cliente.query('DROP TABLE "seccion_estilo"');
      await cliente.query('DELETE FROM "version_estilo"');
      for (const [indice, { texto, vigente }] of versiones.entries()) {
        await cliente.query(
          `INSERT INTO "version_estilo" ("id", "version", "texto", "vigente", "publicado_en") VALUES (gen_random_uuid(), $1, $2, $3, now())`,
          [indice + 1, texto, vigente],
        );
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

async function leerSecciones(cliente: Client): Promise<FilaSeccion[]> {
  const resultado = await cliente.query<FilaSeccion>(
    'SELECT id, titulo, titulo_normalizado, texto, orden, activo FROM "seccion_estilo" ORDER BY orden',
  );
  return resultado.rows;
}

describe('Migración estilo_secciones (integración)', () => {
  it('EST-S3 — Parte el estilo vigente por encabezados `# ` y deja los de nivel inferior dentro del texto', async () => {
    const filas = await conMigracion([{ texto: '# Uno\n\nHola.\n\n## Sub\nmás\n\n# Dos\nAdiós.\n', vigente: true }], leerSecciones);

    expect(filas.map((f) => [f.orden, f.titulo, f.titulo_normalizado, f.texto, f.activo])).toEqual([
      [0, 'Uno', 'uno', 'Hola.\n\n## Sub\nmás', true],
      [1, 'Dos', 'dos', 'Adiós.', true],
    ]);
    expect(filas.every((f) => /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(f.id))).toBe(true);
  });

  it('EST-S3 — El texto previo al primer encabezado queda como la sección «General»', async () => {
    const filas = await conMigracion([{ texto: 'Habla con calidez.\n\n# Saludo\nHola.', vigente: true }], leerSecciones);

    expect(filas.map((f) => [f.titulo, f.texto])).toEqual([
      ['General', 'Habla con calidez.'],
      ['Saludo', 'Hola.'],
    ]);
  });

  it('EST-S3 — Un estilo sin encabezados es una sola sección «General»', async () => {
    const filas = await conMigracion([{ texto: 'Solo un texto.', vigente: true }], leerSecciones);

    expect(filas.map((f) => [f.titulo, f.texto, f.orden])).toEqual([['General', 'Solo un texto.', 0]]);
  });

  it('EST-S3 — Descarta secciones sin texto y numera los títulos repetidos sin acentos ni mayúsculas', async () => {
    const filas = await conMigracion(
      [{ texto: '# Vacía\n\n# Cómo cierras\na\n\n# COMO CIERRAS\nb\n\n# como cierras\nc', vigente: true }],
      leerSecciones,
    );

    expect(filas.map((f) => [f.orden, f.titulo, f.titulo_normalizado])).toEqual([
      [0, 'Cómo cierras', 'como cierras'],
      [1, 'COMO CIERRAS (2)', 'como cierras (2)'],
      [2, 'como cierras (3)', 'como cierras (3)'],
    ]);
  });

  it('EST-S3 — Con saltos de línea de Windows el resultado es el mismo', async () => {
    const filas = await conMigracion([{ texto: '# Uno\r\n\r\nHola.\r\n\r\n# Dos\r\nAdiós.\r\n', vigente: true }], leerSecciones);

    expect(filas.map((f) => [f.titulo, f.texto.replaceAll('\r', '')])).toEqual([
      ['Uno', 'Hola.'],
      ['Dos', 'Adiós.'],
    ]);
  });

  it('EST-S3 — Sin versión vigente no inserta ninguna sección, aunque haya versiones retiradas', async () => {
    expect(await conMigracion([], leerSecciones)).toEqual([]);
    expect(await conMigracion([{ texto: '# Vieja\nTexto.', vigente: false }], leerSecciones)).toEqual([]);
  });

  it('EST-S3 — Solo parte la versión vigente, no las retiradas', async () => {
    const filas = await conMigracion(
      [
        { texto: '# Vieja\nTexto viejo.', vigente: false },
        { texto: '# Nueva\nTexto nuevo.', vigente: true },
      ],
      leerSecciones,
    );

    expect(filas.map((f) => f.titulo)).toEqual(['Nueva']);
  });

  it('EST-S3 — La partición en SQL coincide con dividirEstilo y recompone el estilo inicial', async () => {
    const filas = await conMigracion([{ texto: ESTILO_INICIAL, vigente: true }], leerSecciones);

    expect(filas.map((f) => [f.titulo, f.texto])).toEqual(dividirEstilo(ESTILO_INICIAL).map((s) => [s.titulo, s.texto]));
    expect(componerEstilo(filas.map((f) => ({ titulo: f.titulo, texto: f.texto, orden: f.orden, activo: f.activo })))).toBe(
      ESTILO_INICIAL.trimEnd(),
    );
  });

  it('EST-S3 — Los títulos son únicos por su forma normalizada', async () => {
    const rechazo = await conMigracion([{ texto: '# Uno\na', vigente: true }], async (cliente) => {
      try {
        await cliente.query(`INSERT INTO "seccion_estilo" ("id", "titulo", "titulo_normalizado", "texto", "orden") VALUES (gen_random_uuid(), 'UNO', 'uno', 'x', 9)`);
        return null;
      } catch (error) {
        return (error as { code?: string }).code ?? null;
      }
    });

    expect(rechazo).toBe('23505');
  });
});
