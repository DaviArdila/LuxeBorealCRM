import { normalizarLugar, normalizarTexto, palabrasClave } from './texto.js';

// CMP3 — Normalización de texto y de nombres de lugar. Nombres de escenario tomados literalmente
// de `openspec/changes/fase-00a-esqueleto/specs/compartido/spec.md`.

describe('compartido/texto', () => {
  it('CMP3 — Normalizar texto quita tildes, mayúsculas y espacios repetidos', () => {
    expect(normalizarTexto('  Lámpara   DE  Mesa ')).toBe('lampara de mesa');
  });

  it('CMP3 — Normalizar un lugar además deja solo letras, números y espacios', () => {
    expect(normalizarLugar('Bogotá D.C.')).toBe('bogota dc');
    expect(normalizarLugar('BOGOTA, D.C')).toBe(normalizarLugar('Bogotá D.C.'));
  });

  it('CMP3 — Extraer palabras clave descarta las más cortas que el mínimo', () => {
    expect(palabrasClave('Lámpara de mesa')).toEqual(['lampara', 'mesa']);
    expect(palabrasClave('la de')).toEqual([]);
  });
});
