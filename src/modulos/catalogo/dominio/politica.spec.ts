import { describe, expect, it } from 'vitest';
import {
  claveDeTema,
  esClavePolitica,
  LIMITE_CARACTERES_POLITICA,
  POLITICA_CONTRAENTREGA_POR_DEFECTO,
  temaDeClave,
  validarTemaPolitica,
  validarTextoPolitica,
} from './politica.js';

describe('politica (dominio)', () => {
  it('CAT12 — reconoce las claves politica_<tema> y extrae el tema', () => {
    expect(esClavePolitica('politica_devoluciones')).toBe(true);
    expect(esClavePolitica('recargo_contraentrega_pct')).toBe(false);
    expect(temaDeClave('politica_contra_entrega')).toBe('contra_entrega');
    expect(claveDeTema('garantia')).toBe('politica_garantia');
  });

  it('IMP7 — un tema válido solo tiene minúsculas sin acentos, dígitos y guion bajo', () => {
    expect(validarTemaPolitica('contra_entrega')).toBeNull();
    expect(validarTemaPolitica('garantia2')).toBeNull();
    expect(validarTemaPolitica('')).not.toBeNull();
    expect(validarTemaPolitica('Devoluciones')).not.toBeNull();
    expect(validarTemaPolitica('cambio de talla')).not.toBeNull();
    expect(validarTemaPolitica('garantía')).not.toBeNull();
  });

  it('IMP7 — el texto se recorta y no puede ser vacío ni exceder el límite', () => {
    expect(validarTextoPolitica('  hola  ')).toEqual({ texto: 'hola' });
    expect(validarTextoPolitica('   ')).toHaveProperty('error');
    expect(validarTextoPolitica('a'.repeat(LIMITE_CARACTERES_POLITICA))).toHaveProperty('texto');
    expect(validarTextoPolitica('a'.repeat(LIMITE_CARACTERES_POLITICA + 1))).toHaveProperty('error');
  });

  it('CAT12 — el texto de respaldo de contra entrega cabe en el límite y no cita porcentajes', () => {
    expect(POLITICA_CONTRAENTREGA_POR_DEFECTO.length).toBeLessThanOrEqual(LIMITE_CARACTERES_POLITICA);
    expect(POLITICA_CONTRAENTREGA_POR_DEFECTO).not.toContain('%');
    expect(POLITICA_CONTRAENTREGA_POR_DEFECTO).toContain('se suma al total de tu compra');
  });
});
