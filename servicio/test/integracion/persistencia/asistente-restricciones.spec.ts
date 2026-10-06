import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { urlPostgresDePrueba } from '../../soporte/infraestructura.js';

/**
 * Fase 12, T4: restricciones de `categoria_caso` y `caso_asistente` contra Postgres real. CAS1 (unicidad por nombre y
 * título normalizados, categoría que exista) y los dos `CHECK` `[manual]` de CAS4. La API (T7) traduce estos rechazos
 * a `409` y `404`; aquí se prueba que la base los impone aunque el código falle.
 */
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

async function esperarViolacion(cliente: Client, ejecutar: () => Promise<unknown>, codigo: string): Promise<void> {
  await cliente.query('SAVEPOINT operacion_rechazada');
  try {
    await expect(ejecutar()).rejects.toMatchObject({ code: codigo });
  } finally {
    await cliente.query('ROLLBACK TO SAVEPOINT operacion_rechazada');
    await cliente.query('RELEASE SAVEPOINT operacion_rechazada');
  }
}

async function crearCategoria(cliente: Client, nombreNormalizado: string, id = randomUUID()): Promise<string> {
  await cliente.query(
    `INSERT INTO categoria_caso (id, nombre, nombre_normalizado, orden) VALUES ($1::uuid, $2, $2, 0)`,
    [id, nombreNormalizado],
  );
  return id;
}

interface CasoPrueba {
  readonly categoriaId: string;
  readonly titulo?: string;
  readonly disparador?: 'evento' | 'intencion';
  readonly claveSistema?: string | null;
  readonly modo?: 'literal' | 'guia';
  readonly activo?: boolean;
}

async function crearCaso(cliente: Client, caso: CasoPrueba): Promise<void> {
  const titulo = caso.titulo ?? `titulo-${randomUUID()}`;
  await cliente.query(
    `INSERT INTO caso_asistente
       (id, categoria_id, titulo, titulo_normalizado, cuando_aplica, disparador, clave_sistema, modo, texto, activo, busqueda_normalizada)
     VALUES ($1::uuid, $2::uuid, $3, $3, 'Cuando aplique.', $4::disparador_caso, $5, $6::modo_caso, 'Texto.', $7, $3)`,
    [
      randomUUID(),
      caso.categoriaId,
      titulo,
      caso.disparador ?? 'intencion',
      caso.claveSistema ?? null,
      caso.modo ?? 'literal',
      caso.activo ?? true,
    ],
  );
}

describe('Restricciones de categoria_caso y caso_asistente (Fase 12, T4, integración)', () => {
  it('CAS1 — Dos categorías no pueden llamarse igual', async () => {
    await conTransaccion(async (cliente) => {
      await crearCategoria(cliente, 'politicas-t4');

      await esperarViolacion(cliente, () => crearCategoria(cliente, 'politicas-t4'), '23505');
    });
  });

  it('CAS1 — Un caso necesita una categoría que exista', async () => {
    await conTransaccion(async (cliente) => {
      await esperarViolacion(cliente, () => crearCaso(cliente, { categoriaId: randomUUID() }), '23503');
    });
  });

  it('CAS1 — Dos casos no pueden tener el mismo título', async () => {
    await conTransaccion(async (cliente) => {
      const categoriaId = await crearCategoria(cliente, 'cat-t4');
      await crearCaso(cliente, { categoriaId, titulo: 'garantia-t4' });

      await esperarViolacion(cliente, () => crearCaso(cliente, { categoriaId, titulo: 'garantia-t4' }), '23505');
    });
  });

  it('CAS4 — Un solo caso por clave del sistema', async () => {
    await conTransaccion(async (cliente) => {
      const categoriaId = await crearCategoria(cliente, 'cat-t4');
      await crearCaso(cliente, { categoriaId, disparador: 'evento', claveSistema: 'mensaje_prueba_t4' });

      await esperarViolacion(
        cliente,
        () => crearCaso(cliente, { categoriaId, disparador: 'evento', claveSistema: 'mensaje_prueba_t4' }),
        '23505',
      );
    });
  });

  it('CAS4 — Un caso de evento sin clave del sistema se rechaza', async () => {
    await conTransaccion(async (cliente) => {
      const categoriaId = await crearCategoria(cliente, 'cat-t4');

      await esperarViolacion(cliente, () => crearCaso(cliente, { categoriaId, disparador: 'evento' }), '23514');
    });
  });

  it('CAS4 — Un caso de evento en modo guía se rechaza', async () => {
    await conTransaccion(async (cliente) => {
      const categoriaId = await crearCategoria(cliente, 'cat-t4');

      await esperarViolacion(
        cliente,
        () => crearCaso(cliente, { categoriaId, disparador: 'evento', claveSistema: 'mensaje_prueba_t4', modo: 'guia' }),
        '23514',
      );
    });
  });

  it('CAS4 — Un caso con clave del sistema no puede estar inactivo', async () => {
    await conTransaccion(async (cliente) => {
      const categoriaId = await crearCategoria(cliente, 'cat-t4');

      await esperarViolacion(
        cliente,
        () => crearCaso(cliente, { categoriaId, claveSistema: 'contra_entrega_t4', activo: false }),
        '23514',
      );
    });
  });

  it('CAS4 — Un caso de intención con clave del sistema (contra_entrega) y un caso libre inactivo sí existen', async () => {
    await conTransaccion(async (cliente) => {
      const categoriaId = await crearCategoria(cliente, 'cat-t4');

      await crearCaso(cliente, { categoriaId, claveSistema: 'contra_entrega_t4' });
      await crearCaso(cliente, { categoriaId, activo: false });
    });
  });

  it('CAS2 — Una categoría con casos no se borra a nivel de base', async () => {
    await conTransaccion(async (cliente) => {
      const categoriaId = await crearCategoria(cliente, 'cat-t4');
      await crearCaso(cliente, { categoriaId });

      await esperarViolacion(cliente, () => cliente.query('DELETE FROM categoria_caso WHERE id = $1::uuid', [categoriaId]), '23503');
    });
  });
});
