import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { urlPostgresDePrueba } from '../../soporte/infraestructura.js';

/**
 * Fase 12d, T4: las dos columnas de consentimiento de `contacto` y el `CHECK` `[manual]` que impide que coexistan
 * (PRV1). La base lo impone aunque el código falle.
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

async function crearContacto(cliente: Client): Promise<string> {
  const id = randomUUID();
  await cliente.query(`INSERT INTO contacto (id) VALUES ($1::uuid)`, [id]);
  return id;
}

const VIOLACION_CHECK = '23514';

describe('Consentimiento de datos en contacto (T4, integración)', () => {
  it('PRV1 — Un contacto nuevo no tiene respuesta de consentimiento', async () => {
    await conTransaccion(async (cliente) => {
      const id = await crearContacto(cliente);
      const { rows } = await cliente.query(
        `SELECT consentimiento_datos_en, consentimiento_rechazado_en FROM contacto WHERE id = $1::uuid`,
        [id],
      );
      expect(rows[0]).toEqual({ consentimiento_datos_en: null, consentimiento_rechazado_en: null });
    });
  });

  it('PRV1 — Nunca coexisten la aceptación y el rechazo: la base rechaza tener las dos fechas', async () => {
    await conTransaccion(async (cliente) => {
      const id = await crearContacto(cliente);
      await cliente.query('SAVEPOINT intento');
      await expect(
        cliente.query(
          `UPDATE contacto SET consentimiento_datos_en = now(), consentimiento_rechazado_en = now() WHERE id = $1::uuid`,
          [id],
        ),
      ).rejects.toMatchObject({ code: VIOLACION_CHECK, constraint: 'contacto_consentimiento_excluyente_check' });
      await cliente.query('ROLLBACK TO SAVEPOINT intento');
    });
  });

  it('PRV1 — Una sola de las dos fechas sí se acepta, y pasar de una a la otra exige limpiar la primera', async () => {
    await conTransaccion(async (cliente) => {
      const id = await crearContacto(cliente);
      await cliente.query(`UPDATE contacto SET consentimiento_datos_en = now() WHERE id = $1::uuid`, [id]);
      await cliente.query('SAVEPOINT intento');
      await expect(
        cliente.query(`UPDATE contacto SET consentimiento_rechazado_en = now() WHERE id = $1::uuid`, [id]),
      ).rejects.toMatchObject({ code: VIOLACION_CHECK });
      await cliente.query('ROLLBACK TO SAVEPOINT intento');
      await cliente.query(
        `UPDATE contacto SET consentimiento_rechazado_en = now(), consentimiento_datos_en = NULL WHERE id = $1::uuid`,
        [id],
      );
    });
  });
});
