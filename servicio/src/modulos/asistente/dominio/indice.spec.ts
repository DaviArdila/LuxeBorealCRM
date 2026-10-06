import { describe, expect, it } from 'vitest';
import { construirIndice, lineaDeIndice, MAX_CARACTERES_INDICE, MAX_CASOS_INDICE, type EntradaIndice } from './indice.js';

// CAS8 (Fase 12, T6): el índice de casos de intención que lee el LLM, acotado en cantidad y en caracteres.

function casos(cantidad: number, cuandoAplica = 'Cuando el cliente pregunta.'): EntradaIndice[] {
  return Array.from({ length: cantidad }, (_, i) => ({ titulo: `Caso ${String(i + 1).padStart(3, '0')}`, cuandoAplica }));
}

describe('construirIndice (CAS8)', () => {
  it('CAS8 — Lista los casos en el orden recibido con su título y su «cuándo aplica»', () => {
    const indice = construirIndice([
      { titulo: 'Garantía', cuandoAplica: 'Cuando preguntan por garantía.' },
      { titulo: 'Devoluciones', cuandoAplica: 'Cuando preguntan por cambios.' },
    ]);

    expect(indice.entradas.map(lineaDeIndice)).toEqual([
      '- Garantía: Cuando preguntan por garantía.',
      '- Devoluciones: Cuando preguntan por cambios.',
    ]);
    expect(indice).toMatchObject({ recortado: false, total: 2 });
  });

  it('CAS8 — Un índice vacío no tiene entradas', () => {
    expect(construirIndice([])).toEqual({ entradas: [], recortado: false, total: 0 });
  });

  it('CAS8 — Un índice demasiado grande se recorta a los primeros 60 casos', () => {
    const indice = construirIndice(casos(70));

    expect(indice.entradas).toHaveLength(MAX_CASOS_INDICE);
    expect(indice.entradas[0]?.titulo).toBe('Caso 001');
    expect(indice.entradas[59]?.titulo).toBe('Caso 060');
    expect(indice).toMatchObject({ recortado: true, total: 70 });
  });

  it('CAS8 — Un índice con exactamente 60 casos no se recorta', () => {
    expect(construirIndice(casos(60))).toMatchObject({ recortado: false, total: 60 });
  });

  it('CAS8 — Un índice que pasa de 6.000 caracteres se recorta por caracteres antes que por cantidad', () => {
    const largos = casos(40, 'x'.repeat(190));

    const indice = construirIndice(largos);
    const texto = indice.entradas.map(lineaDeIndice).join('\n');

    expect(indice.recortado).toBe(true);
    expect(indice.entradas.length).toBeLessThan(40);
    expect(texto.length).toBeLessThanOrEqual(MAX_CARACTERES_INDICE);
    expect(indice.total).toBe(40);
  });
});
