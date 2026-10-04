import { describe, expect, it } from 'vitest';
import { MAX_CARACTERES_MENSAJE_FIJO, validarMensajeFijo } from './validar-mensaje-fijo.js';

// CFN2 — validación pura de un mensaje fijo antes de guardarlo (Q2 / P56).

describe('validarMensajeFijo (CFN2)', () => {
  it('el tope es de 1.000 caracteres', () => {
    expect(MAX_CARACTERES_MENSAJE_FIJO).toBe(1000);
  });

  it('acepta un texto normal y uno de exactamente 1.000 caracteres', () => {
    expect(validarMensajeFijo('Ya te comunico con un asesor.')).toEqual({ valido: true });
    expect(validarMensajeFijo('a'.repeat(1000))).toEqual({ valido: true });
  });

  it('CFN2 — rechaza un texto vacío o en blanco', () => {
    expect(validarMensajeFijo('')).toEqual({ valido: false, motivo: 'el mensaje está vacío' });
    expect(validarMensajeFijo('   \n  ')).toEqual({ valido: false, motivo: 'el mensaje está vacío' });
  });

  it('CFN2 — rechaza un texto de 1.001 caracteres', () => {
    expect(validarMensajeFijo('a'.repeat(1001))).toEqual({ valido: false, motivo: 'el mensaje supera 1000 caracteres' });
  });

  it('CFN2 — rechaza un valor en pesos (R2)', () => {
    expect(validarMensajeFijo('Te sale en $ 120.000')).toEqual({
      valido: false,
      motivo: 'el mensaje contiene un valor en pesos (R1, R2)',
    });
  });

  it('CFN2 — rechaza un marcador de plantilla', () => {
    expect(validarMensajeFijo('Hola {{nombre}}')).toEqual({
      valido: false,
      motivo: 'el mensaje contiene un marcador de plantilla {{...}}',
    });
  });

  it('el motivo nombra la regla y nunca copia el texto (R14)', () => {
    const resultado = validarMensajeFijo('Dato privado $ 777.000');

    expect(JSON.stringify(resultado)).not.toContain('privado');
    expect(JSON.stringify(resultado)).not.toContain('777');
  });
});
