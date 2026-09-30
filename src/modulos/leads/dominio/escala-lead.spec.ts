import { evaluarEscala, SENALES } from './escala-lead.js';

// Escenarios LDS1 de `openspec/changes/fase-08-leads-handoff/specs/leads/spec.md` (R9).

describe('modulos/leads/dominio — evaluarEscala (LDS1, D1)', () => {
  it('LDS1 — Una señal fuerte confirma el lead', () => {
    expect(evaluarEscala(['pide_pagar'])).toMatchObject({ confirma: true, fuertes: 1, debiles: 0 });
  });

  it('LDS1 — Dos señales débiles distintas confirman el lead', () => {
    expect(evaluarEscala(['pregunta_precio', 'pide_fotos'])).toMatchObject({ confirma: true, fuertes: 0, debiles: 2 });
  });

  it('LDS1 — Una sola señal débil no confirma', () => {
    expect(evaluarEscala(['pregunta_precio'])).toMatchObject({ confirma: false, debiles: 1 });
  });

  it('LDS1 — La misma señal débil repetida cuenta una vez', () => {
    const resultado = evaluarEscala(['pregunta_precio', 'pregunta_precio']);

    expect(resultado).toMatchObject({ confirma: false, debiles: 1 });
    expect(resultado.validas).toEqual(['pregunta_precio']);
  });

  it('LDS1 — Una señal desconocida se ignora', () => {
    const resultado = evaluarEscala(['esta_emocionado']);

    expect(resultado).toEqual({ confirma: false, fuertes: 0, debiles: 0, validas: [] });
  });

  it('una señal desconocida no le quita valor a las conocidas', () => {
    expect(evaluarEscala(['esta_emocionado', 'confirma_pedido']).confirma).toBe(true);
  });

  it('sin señales no confirma', () => {
    expect(evaluarEscala([]).confirma).toBe(false);
  });

  it('el vocabulario es el aprobado en P33: 5 fuertes y 6 débiles', () => {
    const tipos = Object.values(SENALES);

    expect(tipos.filter((tipo) => tipo === 'fuerte')).toHaveLength(5);
    expect(tipos.filter((tipo) => tipo === 'debil')).toHaveLength(6);
    expect(SENALES['pide_pagar']).toBe('fuerte');
    expect(SENALES['vuelve_a_escribir']).toBe('debil');
  });

  it('conserva el orden de llegada de las señales válidas sin repetir', () => {
    expect(evaluarEscala(['pide_fotos', 'pide_pagar', 'pide_fotos']).validas).toEqual(['pide_fotos', 'pide_pagar']);
  });
});
