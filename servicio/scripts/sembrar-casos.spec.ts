import { describe, expect, it } from 'vitest';
import { ejecutarSembrarCasos, type DependenciasSembrarCasos } from './sembrar-casos.js';

// CAS6 (T4): el reporte del comando `npm run casos:sembrar`; la semilla real se prueba contra Postgres.

type Estilo = DependenciasSembrarCasos['sembrarEstilo'];

const ESTILO_NUEVO: Estilo = { ejecutar: () => Promise.resolve({ sembrado: true, version: 1 }) };
const ESTILO_EXISTENTE: Estilo = { ejecutar: () => Promise.resolve({ sembrado: false }) };
const LEER_ESTILO = () => Promise.resolve('# Cómo escribes\n');

describe('scripts/sembrar-casos (CAS6)', () => {
  it('CAS6 — Informa cuántos casos insertó y cuántos ya existían, sin imprimir ningún texto', async () => {
    const resultado = await ejecutarSembrarCasos({
      sembrar: { ejecutar: () => Promise.resolve({ insertados: 11, existentes: 0 }) },
      sembrarEstilo: ESTILO_NUEVO,
      leerEstiloInicial: LEER_ESTILO,
    });

    expect(resultado).toEqual({
      limpio: true,
      mensaje: 'casos:sembrar: 11 insertados, 0 ya existían.\nestilo: sembrado v1',
    });
  });

  it('CAS6 — Una base ya sembrada informa 0 insertados', async () => {
    const resultado = await ejecutarSembrarCasos({
      sembrar: { ejecutar: () => Promise.resolve({ insertados: 0, existentes: 14 }) },
      sembrarEstilo: ESTILO_EXISTENTE,
      leerEstiloInicial: LEER_ESTILO,
    });

    expect(resultado.mensaje).toBe('casos:sembrar: 0 insertados, 14 ya existían.\nestilo: ya existía');
  });

  it('un fallo de la base termina con error y lo dice sin copiar datos', async () => {
    const resultado = await ejecutarSembrarCasos({
      sembrar: { ejecutar: () => Promise.reject(new Error('conexión rechazada')) },
      sembrarEstilo: ESTILO_NUEVO,
      leerEstiloInicial: LEER_ESTILO,
    });

    expect(resultado).toEqual({ limpio: false, mensaje: 'casos:sembrar: no se pudo sembrar: conexión rechazada' });
  });

  it('CAS6 — Con --archivo lee el JSON, se lo pasa a la semilla y no imprime ningún texto', async () => {
    let recibido: unknown;
    const resultado = await ejecutarSembrarCasos(
      {
        sembrar: { ejecutar: (contenido) => ((recibido = contenido), Promise.resolve({ insertados: 14, existentes: 0 })) },
        leerArchivo: (ruta) => Promise.resolve(ruta === 'casos.json' ? '{"casos":[]}' : ''),
        sembrarEstilo: ESTILO_EXISTENTE,
        leerEstiloInicial: LEER_ESTILO,
      },
      ['--archivo', 'casos.json'],
    );

    expect(recibido).toEqual({ casos: [] });
    expect(resultado).toEqual({
      limpio: true,
      mensaje: 'casos:sembrar: 14 insertados, 0 ya existían.\nestilo: ya existía',
    });
  });

  it('CAS6 — Un archivo que no es JSON termina con error y no siembra nada', async () => {
    let sembrado = false;
    const resultado = await ejecutarSembrarCasos(
      {
        sembrar: { ejecutar: () => ((sembrado = true), Promise.resolve({ insertados: 0, existentes: 0 })) },
        sembrarEstilo: ESTILO_NUEVO,
        leerEstiloInicial: LEER_ESTILO,
        leerArchivo: () => Promise.resolve('no es json'),
      },
      ['--archivo', 'malo.json'],
    );

    expect(resultado.limpio).toBe(false);
    expect(resultado.mensaje).toContain('malo.json');
    expect(sembrado).toBe(false);
  });

  it('CAS6 — Un argumento desconocido o --archivo sin ruta termina con error', async () => {
    const dependencias = {
      sembrar: { ejecutar: () => Promise.resolve({ insertados: 0, existentes: 0 }) },
      sembrarEstilo: ESTILO_NUEVO,
      leerEstiloInicial: LEER_ESTILO,
    };

    expect((await ejecutarSembrarCasos(dependencias, ['--otra'])).limpio).toBe(false);
    expect((await ejecutarSembrarCasos(dependencias, ['--archivo'])).limpio).toBe(false);
  });

  it('EST-D6 — Siembra el texto del archivo de estilo inicial y no lo imprime', async () => {
    let recibido = '';
    const resultado = await ejecutarSembrarCasos({
      sembrar: { ejecutar: () => Promise.resolve({ insertados: 0, existentes: 14 }) },
      sembrarEstilo: { ejecutar: (texto) => ((recibido = texto), Promise.resolve({ sembrado: true, version: 1 })) },
      leerEstiloInicial: () => Promise.resolve('# Texto del estilo\n'),
    });

    expect(recibido).toBe('# Texto del estilo\n');
    expect(resultado.mensaje).not.toContain('Texto del estilo');
  });

  it('EST-D6 — Si el estilo inicial no se puede sembrar termina con error y dice los casos que sí sembró', async () => {
    const resultado = await ejecutarSembrarCasos({
      sembrar: { ejecutar: () => Promise.resolve({ insertados: 3, existentes: 0 }) },
      sembrarEstilo: { ejecutar: () => Promise.reject(new Error('el estilo inicial no es válido: vacío')) },
      leerEstiloInicial: LEER_ESTILO,
    });

    expect(resultado.limpio).toBe(false);
    expect(resultado.mensaje).toContain('casos:sembrar: 3 insertados, 0 ya existían.');
    expect(resultado.mensaje).toContain('estilo: no se pudo sembrar: el estilo inicial no es válido: vacío');
  });

  it('EST-D6 — Un archivo de estilo inicial ilegible termina con error', async () => {
    const resultado = await ejecutarSembrarCasos({
      sembrar: { ejecutar: () => Promise.resolve({ insertados: 0, existentes: 14 }) },
      sembrarEstilo: ESTILO_NUEVO,
      leerEstiloInicial: () => Promise.reject(new Error('ENOENT')),
    });

    expect(resultado.limpio).toBe(false);
    expect(resultado.mensaje).toContain('estilo: no se pudo sembrar');
  });
});
