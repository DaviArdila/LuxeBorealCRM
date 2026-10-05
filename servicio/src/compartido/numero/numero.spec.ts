import { enmascarar, normalizarNumero } from './numero.js';

// CMP2 — Normalización y enmascarado de números de teléfono. Nombres de escenario tomados
// literalmente de `openspec/changes/fase-00a-esqueleto/specs/compartido/spec.md`.

describe('compartido/numero', () => {
  it('CMP2 — Normalizar un número deja solo dígitos', () => {
    expect(normalizarNumero('+57 300 111 2233')).toBe('573001112233');
  });

  it('CMP2 — Enmascarar un número muestra solo los últimos 4 dígitos', () => {
    expect(enmascarar('573001112233')).toBe('***2233');
  });

  it('CMP2 — Enmascarar un número corto conserva todos sus dígitos', () => {
    expect(enmascarar('1234')).toBe('***1234');
  });
});
