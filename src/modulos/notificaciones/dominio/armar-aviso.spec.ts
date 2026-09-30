import { describe, expect, it } from 'vitest';
import { armarAviso, type DatosAviso } from './armar-aviso.js';

const BASE: DatosAviso = {
  tipo: 'lead',
  temperatura: 'caliente',
  senales: ['pide_pagar', 'da_datos_de_entrega'],
  resumen: 'Quiere la manilla de plata para regalo y pregunta por el pago.',
  capturadoFueraHorario: false,
};

describe('armarAviso', () => {
  it('NTF1 — el aviso lleva temperatura, señales y resumen', () => {
    const texto = armarAviso(BASE);

    expect(texto).toContain('caliente');
    expect(texto).toContain('pide_pagar');
    expect(texto).toContain('da_datos_de_entrega');
    expect(texto).toContain('Quiere la manilla de plata');
  });

  it('NTF1 — el aviso no arrastra datos personales que se hayan colado en el resumen', () => {
    const texto = armarAviso({
      ...BASE,
      resumen: 'Escribe desde el 3001234567 y vive en Calle 45 # 12-30, correo ana@correo.com.',
    });

    expect(texto).not.toContain('3001234567');
    expect(texto).not.toContain('Calle 45');
    expect(texto).not.toContain('ana@correo.com');
  });

  it('un lead sin señales no imprime una línea de señales vacía', () => {
    expect(armarAviso({ ...BASE, senales: [] })).not.toContain('Señales');
  });

  it('un lead capturado fuera de horario avisa que hay datos por confirmar', () => {
    expect(armarAviso({ ...BASE, capturadoFueraHorario: true })).toContain('fuera de horario');
  });

  it('el recordatorio se distingue del aviso inicial', () => {
    expect(armarAviso({ ...BASE, tipo: 'recordatorio' })).toContain('sin atender');
    expect(armarAviso(BASE)).not.toContain('sin atender');
  });

  it('acota el resumen para que un aviso no se vuelva un mensaje gigante', () => {
    const texto = armarAviso({ ...BASE, resumen: 'a'.repeat(5000) });

    expect(texto.length).toBeLessThan(1000);
  });
});
