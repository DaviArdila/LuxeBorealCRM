import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dividirEstilo } from './secciones-estilo.js';
import { MAX_CARACTERES_ESTILO, validarEstilo } from './validar-estilo.js';

const ESTILO_INICIAL = readFileSync(
  path.join(import.meta.dirname, '../../../../prisma/datos/estilo-inicial.md'),
  'utf8',
);
const RESPALDO = readFileSync(path.join(import.meta.dirname, '../prompts/estilo.v4.md'), 'utf8');

describe('estilo inicial de la semilla', () => {
  it('pasa la misma validación que una publicación', () => {
    expect(validarEstilo(ESTILO_INICIAL)).toEqual({ valido: true });
  });

  it('deja margen bajo el tope de caracteres', () => {
    expect(ESTILO_INICIAL.length).toBeLessThanOrEqual(MAX_CARACTERES_ESTILO - 100);
  });

  it('EST-D6 — Es el texto mínimo del respaldo bajo un único encabezado, sin prohibiciones', () => {
    // EST-D6: la semilla pasa al mismo texto mínimo que `estilo.v4.md` (decisión del dueño, 2026-10-09).
    expect(dividirEstilo(ESTILO_INICIAL)).toEqual([{ titulo: 'Estilo', texto: RESPALDO.trim() }]);
    expect(ESTILO_INICIAL).not.toMatch(/\b(nunca|jamás|sin emojis)\b/i);
  });
});
