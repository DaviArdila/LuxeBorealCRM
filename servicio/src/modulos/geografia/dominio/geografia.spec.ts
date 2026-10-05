import { describe, expect, it } from 'vitest';
import {
  esCodigoCiudadValido,
  esCodigoDepartamentoValido,
  FuenteDivipolaInvalida,
} from './geografia.js';

describe('geografia (dominio, T3)', () => {
  describe('esCodigoDepartamentoValido', () => {
    it('acepta un código de 2 dígitos', () => {
      expect(esCodigoDepartamentoValido('05')).toBe(true);
    });

    it('rechaza un código con letras', () => {
      expect(esCodigoDepartamentoValido('0A')).toBe(false);
    });

    it('rechaza un código de longitud distinta a 2', () => {
      expect(esCodigoDepartamentoValido('5')).toBe(false);
      expect(esCodigoDepartamentoValido('005')).toBe(false);
    });
  });

  describe('esCodigoCiudadValido', () => {
    it('acepta un código de 5 dígitos cuyo prefijo es el departamento', () => {
      expect(esCodigoCiudadValido('05001', '05')).toBe(true);
    });

    it('rechaza un código de longitud distinta a 5', () => {
      expect(esCodigoCiudadValido('5001', '05')).toBe(false);
    });

    it('rechaza un código cuyo prefijo no coincide con el departamento', () => {
      expect(esCodigoCiudadValido('08001', '05')).toBe(false);
    });
  });

  describe('FuenteDivipolaInvalida', () => {
    it('nombra la fila y la regla en su mensaje', () => {
      const error = new FuenteDivipolaInvalida(12, 'código de departamento repetido');

      expect(error.fila).toBe(12);
      expect(error.regla).toBe('código de departamento repetido');
      expect(error.message).toContain('12');
      expect(error.message).toContain('código de departamento repetido');
      expect(error.name).toBe('FuenteDivipolaInvalida');
    });

    it('es una instancia de Error', () => {
      const error = new FuenteDivipolaInvalida(1, 'regla de prueba');

      expect(error).toBeInstanceOf(Error);
    });
  });
});
