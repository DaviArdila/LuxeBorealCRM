import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { componerEstilo, dividirEstilo, TITULO_SECCION_INICIAL } from './secciones-estilo.js';

const ESTILO_INICIAL = readFileSync(
  path.join(import.meta.dirname, '../../../../prisma/datos/estilo-inicial.md'),
  'utf8',
);

describe('secciones del estilo (EST-S1)', () => {
  it('EST-S1 — Compone solo las secciones activas, por orden, como «# título» y su texto', () => {
    const compuesto = componerEstilo([
      { titulo: 'Segunda', texto: 'Texto dos.', orden: 2, activo: true },
      { titulo: 'Apagada', texto: 'No va.', orden: 1, activo: false },
      { titulo: 'Primera', texto: 'Texto uno.', orden: 0, activo: true },
    ]);

    expect(compuesto).toBe('# Primera\n\nTexto uno.\n\n# Segunda\n\nTexto dos.');
  });

  it('EST-S1 — Sin secciones activas el compuesto es vacío', () => {
    expect(componerEstilo([])).toBe('');
    expect(componerEstilo([{ titulo: 'A', texto: 'a', orden: 0, activo: false }])).toBe('');
  });

  it('EST-S1 — Divide por encabezados de primer nivel y deja los de nivel inferior dentro del texto', () => {
    const secciones = dividirEstilo('# Uno\n\nHola.\n\n## Sub\nmás\n\n# Dos\nAdiós.\n');

    expect(secciones).toEqual([
      { titulo: 'Uno', texto: 'Hola.\n\n## Sub\nmás' },
      { titulo: 'Dos', texto: 'Adiós.' },
    ]);
  });

  it('EST-S1 — El texto previo al primer encabezado es la sección «General»', () => {
    expect(TITULO_SECCION_INICIAL).toBe('General');
    expect(dividirEstilo('Habla con calidez.\n\n# Saludo\nHola.')).toEqual([
      { titulo: 'General', texto: 'Habla con calidez.' },
      { titulo: 'Saludo', texto: 'Hola.' },
    ]);
    expect(dividirEstilo('Solo un texto.')).toEqual([{ titulo: 'General', texto: 'Solo un texto.' }]);
  });

  it('EST-S1 — Descarta secciones sin texto y un texto en blanco no produce secciones', () => {
    expect(dividirEstilo('# Vacía\n\n# Con texto\nSí.')).toEqual([{ titulo: 'Con texto', texto: 'Sí.' }]);
    expect(dividirEstilo('  \n')).toEqual([]);
  });

  it('EST-S1 — Los títulos repetidos (sin acentos ni mayúsculas) se numeran para que sigan siendo únicos', () => {
    const titulos = dividirEstilo('# Saludo\na\n\n# saludo\nb\n\n# SALUDO\nc').map((s) => s.titulo);

    expect(titulos).toEqual(['Saludo', 'saludo (2)', 'SALUDO (3)']);
  });

  it('EST-S1 — Dividir el estilo inicial y componerlo devuelve el mismo texto', () => {
    const secciones = dividirEstilo(ESTILO_INICIAL);

    expect(secciones.map((s) => s.titulo)).toContain('Estilo');
    expect(componerEstilo(secciones.map((s, orden) => ({ ...s, orden, activo: true })))).toBe(ESTILO_INICIAL.trimEnd());
  });
});
