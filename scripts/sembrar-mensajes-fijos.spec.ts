import { describe, expect, it } from 'vitest';
import { ejecutarSembrarMensajesFijos } from './sembrar-mensajes-fijos.js';

// CFN3 (T4): el reporte del comando `npm run mensajes:sembrar`; la semilla real se prueba contra Postgres.

describe('scripts/sembrar-mensajes-fijos (CFN3)', () => {
  it('CFN3 — Informa cuántas claves insertó y cuántas ya existían, sin imprimir ningún texto', async () => {
    const resultado = await ejecutarSembrarMensajesFijos({
      sembrar: { ejecutar: () => Promise.resolve({ insertadas: 7, existentes: 3 }) },
    });

    expect(resultado).toEqual({ limpio: true, mensaje: 'mensajes:sembrar: 7 insertadas, 3 ya existían.' });
  });

  it('CFN3 — Una base ya sembrada informa 0 insertadas y 10 existentes', async () => {
    const resultado = await ejecutarSembrarMensajesFijos({
      sembrar: { ejecutar: () => Promise.resolve({ insertadas: 0, existentes: 10 }) },
    });

    expect(resultado.mensaje).toBe('mensajes:sembrar: 0 insertadas, 10 ya existían.');
  });

  it('un fallo de la base termina con error y lo dice sin copiar datos', async () => {
    const resultado = await ejecutarSembrarMensajesFijos({
      sembrar: { ejecutar: () => Promise.reject(new Error('conexión rechazada')) },
    });

    expect(resultado.limpio).toBe(false);
    expect(resultado.mensaje).toBe('mensajes:sembrar: no se pudo sembrar: conexión rechazada');
  });
});
