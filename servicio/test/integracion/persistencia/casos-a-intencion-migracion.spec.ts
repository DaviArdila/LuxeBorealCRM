import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { urlPostgresDePrueba } from '../../soporte/infraestructura.js';

/**
 * Fase 12d, T6 (CAS14, paso 1): la migración de datos `20261009130000_casos_a_intencion` convierte `contra_entrega`,
 * `mensaje_fuera_cobertura` y `mensaje_captura_completa` en casos de intención normales. Se ejecuta su SQL real contra
 * Postgres, dentro de una transacción que se deshace, sobre filas con la forma que dejó la Fase 12.
 */
const MIGRACION = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'prisma',
  'migrations',
  '20261009130000_casos_a_intencion',
  'migration.sql',
);

async function conTransaccion(accion: (cliente: Client) => Promise<void>): Promise<void> {
  const cliente = new Client({ connectionString: urlPostgresDePrueba() });
  await cliente.connect();
  try {
    await cliente.query('BEGIN');
    try {
      await cliente.query('DELETE FROM caso_asistente');
      await cliente.query('DELETE FROM categoria_caso');
      await accion(cliente);
    } finally {
      await cliente.query('ROLLBACK');
    }
  } finally {
    await cliente.end();
  }
}

async function crearCategoria(cliente: Client, nombre: string, normalizado: string, orden: number): Promise<string> {
  const id = randomUUID();
  await cliente.query(`INSERT INTO categoria_caso (id, nombre, nombre_normalizado, orden) VALUES ($1::uuid, $2, $3, $4)`, [id, nombre, normalizado, orden]);
  return id;
}

interface CasoDelSistema {
  readonly clave: string;
  readonly titulo: string;
  readonly texto: string;
  readonly disparador: 'evento' | 'intencion';
  readonly categoriaId: string;
}

async function crearCasoDelSistema(cliente: Client, caso: CasoDelSistema): Promise<void> {
  await cliente.query(
    `INSERT INTO caso_asistente
       (id, categoria_id, titulo, titulo_normalizado, cuando_aplica, disparador, clave_sistema, modo, texto, activo, busqueda_normalizada, creado, actualizado)
     VALUES ($1::uuid, $2::uuid, $3, lower($3), $4, $5::disparador_caso, $6, 'literal', $7, true, lower($3 || ' ' || $7), '2026-10-01T09:00:00Z', '2026-10-02T09:00:00Z')`,
    [randomUUID(), caso.categoriaId, caso.titulo, `Cuándo aplica ${caso.titulo}.`, caso.disparador, caso.clave, caso.texto],
  );
}

/** Los tres casos como los dejó la Fase 12: `contra_entrega` ya de intención y los otros dos de evento, con textos del dueño. */
async function sembrarLosTres(cliente: Client, categoriaId: string): Promise<void> {
  await crearCasoDelSistema(cliente, { clave: 'contra_entrega', titulo: 'Contra entrega', texto: 'TEXTO-DEL-DUENO contra entrega.', disparador: 'intencion', categoriaId });
  await crearCasoDelSistema(cliente, { clave: 'mensaje_fuera_cobertura', titulo: 'Sin cobertura de envío', texto: 'TEXTO-DEL-DUENO sin cobertura.', disparador: 'evento', categoriaId });
  await crearCasoDelSistema(cliente, { clave: 'mensaje_captura_completa', titulo: 'Datos completos fuera de horario', texto: 'TEXTO-DEL-DUENO captura.', disparador: 'evento', categoriaId });
}

interface Fila {
  readonly titulo: string;
  readonly texto: string;
  readonly cuando_aplica: string;
  readonly disparador: string;
  readonly clave_sistema: string | null;
  readonly categoria: string;
  readonly creado: Date;
  readonly actualizado: Date;
  readonly busqueda_normalizada: string;
}

async function leerCasos(cliente: Client): Promise<readonly Fila[]> {
  const resultado = await cliente.query<Fila>(
    `SELECT c.titulo, c.texto, c.cuando_aplica, c.disparador::text AS disparador, c.clave_sistema, k.nombre AS categoria, c.creado, c.actualizado, c.busqueda_normalizada
       FROM caso_asistente c JOIN categoria_caso k ON k.id = c.categoria_id ORDER BY c.titulo`,
  );
  return resultado.rows;
}

describe('Migración casos_a_intencion (Fase 12d, T6, CAS14 paso 1, integración)', () => {
  it('CAS14 — Los tres casos conservados dejan de ser del sistema y conservan su texto', async () => {
    await conTransaccion(async (cliente) => {
      const sistema = await crearCategoria(cliente, 'Sistema', 'sistema', 0);
      await sembrarLosTres(cliente, sistema);
      const antes = await leerCasos(cliente);

      await cliente.query(readFileSync(MIGRACION, 'utf8'));

      const despues = await leerCasos(cliente);
      expect(despues).toHaveLength(3);
      for (const fila of despues) {
        const original = antes.find((a) => a.titulo === fila.titulo);
        expect(fila.clave_sistema).toBeNull();
        expect(fila.disparador).toBe('intencion');
        expect(fila.texto).toBe(original?.texto);
        expect(fila.cuando_aplica).toBe(original?.cuando_aplica);
        expect(fila.creado).toEqual(original?.creado);
        expect(fila.busqueda_normalizada).toBe(original?.busqueda_normalizada);
      }
      expect(despues.map((f) => f.titulo)).toEqual(['Contra entrega', 'Datos completos fuera de horario', 'Sin cobertura de envío']);
    });
  });

  it('CAS14 — Los casos convertidos se pueden editar y borrar', async () => {
    await conTransaccion(async (cliente) => {
      const sistema = await crearCategoria(cliente, 'Sistema', 'sistema', 0);
      await sembrarLosTres(cliente, sistema);
      await cliente.query(readFileSync(MIGRACION, 'utf8'));

      const editado = await cliente.query(`UPDATE caso_asistente SET activo = false WHERE titulo = 'Contra entrega'`);
      const borrados = await cliente.query(`DELETE FROM caso_asistente WHERE titulo IN ('Sin cobertura de envío', 'Datos completos fuera de horario')`);

      expect(editado.rowCount).toBe(1);
      expect(borrados.rowCount).toBe(2);
    });
  });

  it('CAS14 — La conversión respeta la restricción de disparador y clave', async () => {
    await conTransaccion(async (cliente) => {
      const sistema = await crearCategoria(cliente, 'Sistema', 'sistema', 0);
      await crearCasoDelSistema(cliente, {
        clave: 'mensaje_captura_completa',
        titulo: 'Datos completos fuera de horario',
        texto: 'Listo, ya tengo tus datos.',
        disparador: 'evento',
        categoriaId: sistema,
      });

      await expect(cliente.query(readFileSync(MIGRACION, 'utf8'))).resolves.toBeDefined();

      const [fila] = await leerCasos(cliente);
      expect(fila).toMatchObject({ disparador: 'intencion', clave_sistema: null });
    });
  });

  it('CAS14 — Correr la migración dos veces no cambia nada', async () => {
    await conTransaccion(async (cliente) => {
      const sistema = await crearCategoria(cliente, 'Sistema', 'sistema', 0);
      await crearCategoria(cliente, 'Políticas', 'politicas', 1);
      await sembrarLosTres(cliente, sistema);
      await cliente.query(readFileSync(MIGRACION, 'utf8'));
      const primera = await leerCasos(cliente);

      await cliente.query(readFileSync(MIGRACION, 'utf8'));

      expect(await leerCasos(cliente)).toEqual(primera);
    });
  });

  it('CAS14 — Los casos convertidos se mueven a «Políticas» y «Sistema» conserva solo los casos con clave', async () => {
    await conTransaccion(async (cliente) => {
      const sistema = await crearCategoria(cliente, 'Sistema', 'sistema', 0);
      await crearCategoria(cliente, 'Políticas', 'politicas', 1);
      await sembrarLosTres(cliente, sistema);
      await crearCasoDelSistema(cliente, { clave: 'mensaje_error_llm', titulo: 'Falla técnica del modelo', texto: 'Ya te respondemos.', disparador: 'evento', categoriaId: sistema });

      await cliente.query(readFileSync(MIGRACION, 'utf8'));

      const casos = await leerCasos(cliente);
      expect(casos.filter((c) => c.clave_sistema === null).map((c) => c.categoria)).toEqual(['Políticas', 'Políticas', 'Políticas']);
      expect(casos.filter((c) => c.categoria === 'Sistema').map((c) => c.clave_sistema)).toEqual(['mensaje_error_llm']);
    });
  });

  it('CAS14 — Sin la categoría «Políticas» los casos conservan la suya', async () => {
    await conTransaccion(async (cliente) => {
      const sistema = await crearCategoria(cliente, 'Sistema', 'sistema', 0);
      await sembrarLosTres(cliente, sistema);

      await expect(cliente.query(readFileSync(MIGRACION, 'utf8'))).resolves.toBeDefined();

      expect((await leerCasos(cliente)).map((c) => c.categoria)).toEqual(['Sistema', 'Sistema', 'Sistema']);
    });
  });

  it('CAS14 — Los demás casos del sistema no se tocan', async () => {
    await conTransaccion(async (cliente) => {
      const sistema = await crearCategoria(cliente, 'Sistema', 'sistema', 0);
      await crearCategoria(cliente, 'Políticas', 'politicas', 1);
      await crearCasoDelSistema(cliente, { clave: 'mensaje_error_llm', titulo: 'Falla técnica del modelo', texto: 'Ya te respondemos.', disparador: 'evento', categoriaId: sistema });
      const antes = await leerCasos(cliente);

      await cliente.query(readFileSync(MIGRACION, 'utf8'));

      expect(await leerCasos(cliente)).toEqual(antes);
    });
  });
});
