import { describe, expect, it } from 'vitest';
import { normalizarNombre, textoDeBusqueda } from './normalizar.js';

describe('normalización de casos (CAS1, CAS10)', () => {
  it('CAS1 — «Políticas» y «politicas» normalizan igual', () => {
    expect(normalizarNombre('Políticas')).toBe(normalizarNombre('  politicas '));
  });

  it('CAS10 — La búsqueda junta título, «cuándo aplica» y texto sin acentos ni mayúsculas', () => {
    expect(textoDeBusqueda({ titulo: 'Garantía', cuandoAplica: 'Cuando PREGUNTA', texto: 'Ocho días' })).toBe(
      'garantia cuando pregunta ocho dias',
    );
  });
});
