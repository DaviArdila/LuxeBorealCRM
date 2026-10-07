import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_CARACTERES_ESTILO, validarEstilo } from './validar-estilo.js';

const ESTILO_INICIAL = readFileSync(
  path.join(import.meta.dirname, '../../../../prisma/datos/estilo-inicial.md'),
  'utf8',
);

describe('estilo inicial de la semilla', () => {
  it('pasa la misma validación que una publicación', () => {
    expect(validarEstilo(ESTILO_INICIAL)).toEqual({ valido: true });
  });

  it('deja margen bajo el tope de caracteres', () => {
    expect(ESTILO_INICIAL.length).toBeLessThanOrEqual(MAX_CARACTERES_ESTILO - 100);
  });

  it.each(['# Saludo', '# Cómo presentas un producto', '# Cuando algo sale mal', '# Cómo cierras'])(
    'trae la sección %s',
    (encabezado) => {
      expect(ESTILO_INICIAL).toContain(encabezado);
    },
  );

  it('no repite en el texto lo que ya lleva el pie de la foto', () => {
    expect(ESTILO_INICIAL).toMatch(/pie de la foto/i);
  });
});
