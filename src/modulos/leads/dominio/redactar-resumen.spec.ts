import { redactarResumen } from './redactar-resumen.js';

// LDS2 «El resumen no lleva datos personales» (R14, P15): la redacción de la parte pura.

describe('modulos/leads/dominio — redactarResumen (LDS2, D3)', () => {
  it('LDS2 — El resumen no lleva datos personales: teléfono, correo y cédula se omiten', () => {
    const resumen = redactarResumen(
      'Quiere el anillo. Su cel es 3001234567 y su correo laura@correo.com; cédula 1.023.456.789.',
    );

    expect(resumen).toBe('Quiere el anillo. Su cel es [dato omitido] y su correo [dato omitido]; cédula [dato omitido].');
  });

  it('omite teléfonos con formato y con indicativo', () => {
    expect(redactarResumen('llamar al +57 300 123 4567')).toBe('llamar al [dato omitido]');
    expect(redactarResumen('llamar al 300-123-4567')).toBe('llamar al [dato omitido]');
  });

  it('omite direcciones con nomenclatura colombiana', () => {
    expect(redactarResumen('vive en la Calle 45 # 12-34 apto 301')).toBe('vive en la [dato omitido] apto 301');
    expect(redactarResumen('envío a Cra 7 No. 1-1')).toBe('envío a [dato omitido]');
  });

  it('omite cualquier secuencia de siete o más dígitos aunque venga separada', () => {
    expect(redactarResumen('mi número es 3 0 0 1 2 3 4 5 6 7')).not.toMatch(/\d{2}/);
  });

  it('deja intactos los precios y las cifras cortas', () => {
    expect(redactarResumen('preguntó por 2 unidades del SKU-12 a $389.000')).toBe(
      'preguntó por 2 unidades del SKU-12 a $389.000',
    );
  });

  it('recorta los espacios de los extremos', () => {
    expect(redactarResumen('  quiere pagar  ')).toBe('quiere pagar');
  });
});
