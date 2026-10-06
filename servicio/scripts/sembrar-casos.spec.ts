import { describe, expect, it } from 'vitest';
import { ejecutarSembrarCasos } from './sembrar-casos.js';

// CAS6 (T4): el reporte del comando `npm run casos:sembrar`; la semilla real se prueba contra Postgres.

describe('scripts/sembrar-casos (CAS6)', () => {
  it('CAS6 — Informa cuántos casos insertó y cuántos ya existían, sin imprimir ningún texto', async () => {
    const resultado = await ejecutarSembrarCasos({
      sembrar: { ejecutar: () => Promise.resolve({ insertados: 11, existentes: 0 }) },
    });

    expect(resultado).toEqual({ limpio: true, mensaje: 'casos:sembrar: 11 insertados, 0 ya existían.' });
  });

  it('CAS6 — Una base ya sembrada informa 0 insertados', async () => {
    const resultado = await ejecutarSembrarCasos({
      sembrar: { ejecutar: () => Promise.resolve({ insertados: 0, existentes: 14 }) },
    });

    expect(resultado.mensaje).toBe('casos:sembrar: 0 insertados, 14 ya existían.');
  });

  it('un fallo de la base termina con error y lo dice sin copiar datos', async () => {
    const resultado = await ejecutarSembrarCasos({
      sembrar: { ejecutar: () => Promise.reject(new Error('conexión rechazada')) },
    });

    expect(resultado).toEqual({ limpio: false, mensaje: 'casos:sembrar: no se pudo sembrar: conexión rechazada' });
  });
});
