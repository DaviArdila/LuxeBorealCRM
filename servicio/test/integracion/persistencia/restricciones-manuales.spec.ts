import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  leerMarcasManuales,
  verificarMarcasManuales,
} from './marcas-manuales.js';
import { urlPostgresDePrueba } from '../../soporte/infraestructura.js';

const RAIZ_REPOSITORIO = path.resolve(import.meta.dirname, '..', '..', '..');
const CARPETA_MIGRACIONES = path.join(RAIZ_REPOSITORIO, 'prisma', 'migrations');
const NOMBRE_INDICE_ZONA = 'zona_sin_cobertura_departamento_id_ciudad_id_key';
const NOMBRE_CHECK_CANTIDAD = 'movimiento_inventario_cantidad_positiva_check';
const NOMBRE_CHECK_USUARIO = 'movimiento_inventario_usuario_si_origen_usuario_check';
const NOMBRE_INDICE_ESTILO_VIGENTE = 'version_estilo_vigente_key';

async function conTransaccion<T>(accion: (cliente: Client) => Promise<T>): Promise<T> {
  const cliente = new Client({ connectionString: urlPostgresDePrueba() });
  await cliente.connect();

  try {
    await cliente.query('BEGIN');
    try {
      return await accion(cliente);
    } finally {
      await cliente.query('ROLLBACK');
    }
  } finally {
    await cliente.end();
  }
}

async function esperarViolacion(
  cliente: Client,
  ejecutar: () => Promise<unknown>,
  codigo: string,
): Promise<void> {
  await cliente.query('SAVEPOINT operacion_rechazada');
  try {
    await expect(ejecutar()).rejects.toMatchObject({ code: codigo });
  } finally {
    await cliente.query('ROLLBACK TO SAVEPOINT operacion_rechazada');
    await cliente.query('RELEASE SAVEPOINT operacion_rechazada');
  }
}

async function crearDepartamento(cliente: Client, id: string): Promise<void> {
  await cliente.query('INSERT INTO departamento (id, nombre) VALUES ($1, $2)', [
    id,
    `Departamento de prueba ${id}`,
  ]);
}

async function insertarZonaSinCobertura(
  cliente: Client,
  departamentoId: string,
): Promise<void> {
  await cliente.query(
    `INSERT INTO zona_sin_cobertura (id, departamento_id, ciudad_id)
     VALUES ($1::uuid, $2, NULL)`,
    [randomUUID(), departamentoId],
  );
}

async function crearProducto(cliente: Client): Promise<string> {
  const id = randomUUID();
  await cliente.query(
    `INSERT INTO producto (id, sku, nombre, descripcion_corta, descripcion_larga, precio_cop)
     VALUES ($1::uuid, $2, 'Producto de prueba', 'Descripción corta', 'Descripción larga', 1000)`,
    [id, `T2-${randomUUID()}`],
  );
  return id;
}

async function insertarMovimiento(
  cliente: Client,
  productoId: string,
  opciones: { readonly cantidad: number; readonly origen: 'usuario' | 'sistema' },
): Promise<void> {
  await cliente.query(
    `INSERT INTO movimiento_inventario
       (id, producto_id, tipo, cantidad, saldo_despues, origen, usuario_id)
     VALUES ($1::uuid, $2::uuid, 'entrada', $3, 0, $4, NULL)`,
    [randomUUID(), productoId, opciones.cantidad, opciones.origen],
  );
}

describe('Restricciones manuales de esquema (T2, integración)', () => {
  it('PER6 — Dos exclusiones de todo el mismo departamento se rechazan', async () => {
    await conTransaccion(async (cliente) => {
      await crearDepartamento(cliente, '90');
      await insertarZonaSinCobertura(cliente, '90');

      await esperarViolacion(cliente, () => insertarZonaSinCobertura(cliente, '90'), '23505');
    });
  });

  it('PER6 — Exclusiones de departamentos distintos con ciudad nula coexisten', async () => {
    await conTransaccion(async (cliente) => {
      await crearDepartamento(cliente, '90');
      await crearDepartamento(cliente, '91');
      await insertarZonaSinCobertura(cliente, '90');
      await insertarZonaSinCobertura(cliente, '91');

      const exclusiones = await cliente.query<{ cantidad: number }>(
        `SELECT COUNT(*)::int AS cantidad
         FROM zona_sin_cobertura
         WHERE departamento_id = ANY($1::text[]) AND ciudad_id IS NULL`,
        [['90', '91']],
      );
      expect(exclusiones.rows[0]?.cantidad).toBe(2);
    });
  });

  it('PER7 — Un movimiento con origen usuario sin usuario_id se rechaza', async () => {
    await conTransaccion(async (cliente) => {
      const productoId = await crearProducto(cliente);
      await cliente.query(
        `INSERT INTO usuario (id, email, nombre, password_hash, rol)
         VALUES ($1::uuid, $2, 'Asesor de prueba', 'hash-de-prueba', 'admin')`,
        [randomUUID(), `t2-${randomUUID()}@example.test`],
      );

      await esperarViolacion(
        cliente,
        () => insertarMovimiento(cliente, productoId, { cantidad: 1, origen: 'usuario' }),
        '23514',
      );
    });
  });

  it('PER7 — Un movimiento con origen sistema no exige usuario_id', async () => {
    await conTransaccion(async (cliente) => {
      const productoId = await crearProducto(cliente);
      await insertarMovimiento(cliente, productoId, { cantidad: 1, origen: 'sistema' });

      const movimientos = await cliente.query<{ origen: string; usuario_id: string | null }>(
        `SELECT origen, usuario_id
         FROM movimiento_inventario
         WHERE producto_id = $1::uuid`,
        [productoId],
      );
      expect(movimientos.rows).toEqual([{ origen: 'sistema', usuario_id: null }]);
    });
  });

  it('PER8 — Un movimiento con cantidad cero o negativa se rechaza', async () => {
    await conTransaccion(async (cliente) => {
      const productoId = await crearProducto(cliente);

      for (const cantidad of [0, -1]) {
        await esperarViolacion(
          cliente,
          () => insertarMovimiento(cliente, productoId, { cantidad, origen: 'sistema' }),
          '23514',
        );
      }
    });
  });

  it('PER9 — El registro de marcas [manual] encuentra cada restricción en el catálogo de Postgres', async () => {
    await conTransaccion(async (cliente) => {
      const marcas = leerMarcasManuales(CARPETA_MIGRACIONES);
      expect(marcas.map((marca) => marca.nombre).sort()).toEqual(
        [NOMBRE_INDICE_ZONA, NOMBRE_CHECK_CANTIDAD, NOMBRE_CHECK_USUARIO, NOMBRE_INDICE_ESTILO_VIGENTE].sort(),
      );

      const resultado = await verificarMarcasManuales(cliente, marcas);
      expect(resultado).toEqual({ ok: true, faltantes: [] });
    });
  });

  it('PER9 — Una restricción [manual] ausente del catálogo hace fallar la verificación', async () => {
    await conTransaccion(async (cliente) => {
      await cliente.query(
        `ALTER TABLE movimiento_inventario DROP CONSTRAINT "${NOMBRE_CHECK_USUARIO}"`,
      );

      const resultado = await verificarMarcasManuales(
        cliente,
        leerMarcasManuales(CARPETA_MIGRACIONES),
      );
      expect(resultado.ok).toBe(false);
      expect(resultado.faltantes).toContain(NOMBRE_CHECK_USUARIO);
    });
  });

  it('PER9 — Una restricción [manual] con una condición distinta se considera faltante', async () => {
    await conTransaccion(async (cliente) => {
      await cliente.query(
        `ALTER TABLE movimiento_inventario DROP CONSTRAINT "${NOMBRE_CHECK_CANTIDAD}"`,
      );
      await cliente.query(
        `ALTER TABLE movimiento_inventario
         ADD CONSTRAINT "${NOMBRE_CHECK_CANTIDAD}" CHECK (cantidad >= 0)`,
      );

      const resultado = await verificarMarcasManuales(
        cliente,
        leerMarcasManuales(CARPETA_MIGRACIONES),
      );
      expect(resultado.ok).toBe(false);
      expect(resultado.faltantes).toContain(NOMBRE_CHECK_CANTIDAD);
    });
  });
  it('PER9 — Un índice único parcial [manual] reemplazado por uno total se considera faltante', async () => {
    await conTransaccion(async (cliente) => {
      await cliente.query(`DROP INDEX "${NOMBRE_INDICE_ESTILO_VIGENTE}"`);
      await cliente.query(`CREATE UNIQUE INDEX "${NOMBRE_INDICE_ESTILO_VIGENTE}" ON version_estilo (vigente)`);

      const resultado = await verificarMarcasManuales(
        cliente,
        leerMarcasManuales(CARPETA_MIGRACIONES),
      );
      expect(resultado.ok).toBe(false);
      expect(resultado.faltantes).toContain(NOMBRE_INDICE_ESTILO_VIGENTE);
    });
  });
});
