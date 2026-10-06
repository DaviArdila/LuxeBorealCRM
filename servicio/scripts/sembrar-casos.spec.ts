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

  it('CAS6 — Con --archivo lee el JSON, se lo pasa a la semilla y no imprime ningún texto', async () => {
    let recibido: unknown;
    const resultado = await ejecutarSembrarCasos(
      {
        sembrar: { ejecutar: (contenido) => ((recibido = contenido), Promise.resolve({ insertados: 14, existentes: 0 })) },
        leerArchivo: (ruta) => Promise.resolve(ruta === 'casos.json' ? '{"casos":[]}' : ''),
      },
      ['--archivo', 'casos.json'],
    );

    expect(recibido).toEqual({ casos: [] });
    expect(resultado).toEqual({ limpio: true, mensaje: 'casos:sembrar: 14 insertados, 0 ya existían.' });
  });

  it('CAS6 — Un archivo que no es JSON termina con error y no siembra nada', async () => {
    let sembrado = false;
    const resultado = await ejecutarSembrarCasos(
      { sembrar: { ejecutar: () => ((sembrado = true), Promise.resolve({ insertados: 0, existentes: 0 })) }, leerArchivo: () => Promise.resolve('no es json') },
      ['--archivo', 'malo.json'],
    );

    expect(resultado.limpio).toBe(false);
    expect(resultado.mensaje).toContain('malo.json');
    expect(sembrado).toBe(false);
  });

  it('CAS6 — Un argumento desconocido o --archivo sin ruta termina con error', async () => {
    const dependencias = { sembrar: { ejecutar: () => Promise.resolve({ insertados: 0, existentes: 0 }) } };

    expect((await ejecutarSembrarCasos(dependencias, ['--otra'])).limpio).toBe(false);
    expect((await ejecutarSembrarCasos(dependencias, ['--archivo'])).limpio).toBe(false);
  });
});
