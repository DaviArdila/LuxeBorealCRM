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

const ENLACE = 'https://chat.ejemplo.co/app/accounts/1/conversations/2';

describe('armarAviso — 08d: producto y enlace', () => {
  it('NTF1 — un lead con producto lo nombra y no cita ningún SKU', () => {
    const texto = armarAviso({ ...BASE, producto: 'Regadera fija con brazo' });

    expect(texto).toContain('Producto: Regadera fija con brazo');
    expect(texto).not.toMatch(/SKU-/i);
  });

  it('un lead sin producto no imprime la línea de producto', () => {
    expect(armarAviso(BASE)).not.toContain('Producto');
  });

  it('NTF5 — el enlace va en una línea propia', () => {
    const lineas = armarAviso({ ...BASE, enlace: ENLACE }).split('\n');

    expect(lineas).toContain(`Atender: ${ENLACE}`);
    expect(lineas[lineas.length - 1]).toBe(`Atender: ${ENLACE}`);
  });

  it('NTF5 — sin enlace el aviso sale sin la línea de atender', () => {
    expect(armarAviso(BASE)).not.toContain('Atender');
  });

  it('el recordatorio también lleva producto y enlace', () => {
    const texto = armarAviso({ ...BASE, tipo: 'recordatorio', producto: 'Grifo mezclador', enlace: ENLACE });

    expect(texto).toContain('sin atender');
    expect(texto).toContain('Producto: Grifo mezclador');
    expect(texto).toContain(ENLACE);
  });

  it('NTF1 — el nombre del producto pasa también por la redacción de datos personales', () => {
    const texto = armarAviso({ ...BASE, producto: 'Grifo 3001234567 ana@correo.com' });

    expect(texto).not.toContain('3001234567');
    expect(texto).not.toContain('ana@correo.com');
  });
});

describe('armarAviso — 08d: traspaso sin lead (NTF6)', () => {
  const MOTIVOS = [
    'tope-turnos',
    'fallo-llm',
    'techo-gasto',
    'argumentos-invalidos',
    'plazo-agotado',
  ] as const;

  it.each(MOTIVOS)('NTF6 — el motivo %s dice qué pasó y lleva el enlace', (motivo) => {
    const texto = armarAviso({ tipo: 'traspaso', motivo, enlace: ENLACE });

    expect(texto.startsWith('Traspaso:')).toBe(true);
    expect(texto).toContain(`Atender: ${ENLACE}`);
  });

  it('NTF6 — cada motivo tiene un texto propio', () => {
    const titulos = MOTIVOS.map((motivo) => armarAviso({ tipo: 'traspaso', motivo }).split('\n')[0]);

    expect(new Set(titulos).size).toBe(MOTIVOS.length);
  });

  it('NTF6 — el tope de turnos y el techo de gasto se distinguen', () => {
    expect(armarAviso({ tipo: 'traspaso', motivo: 'tope-turnos' })).toContain('tope de turnos');
    expect(armarAviso({ tipo: 'traspaso', motivo: 'techo-gasto' })).toContain('techo de gasto');
  });

  it('NTF1 — el traspaso no contiene datos del cliente porque no recibe ninguno', () => {
    const texto = armarAviso({ tipo: 'traspaso', motivo: 'fallo-llm', enlace: ENLACE });

    expect(texto).not.toMatch(/\d{7,}/);
    expect(texto).not.toContain('@');
  });
});

describe('armarAviso — 08d: cliente esperando (NTF7)', () => {
  it('NTF7 — dice hace cuántos minutos escribió y lleva el enlace', () => {
    const texto = armarAviso({ tipo: 'espera', esperaMin: 11, enlace: ENLACE });

    expect(texto).toContain('Cliente esperando');
    expect(texto).toContain('hace 11 min');
    expect(texto).toContain(`Atender: ${ENLACE}`);
  });

  it('NTF7 — los minutos se redondean hacia abajo y nunca salen negativos', () => {
    expect(armarAviso({ tipo: 'espera', esperaMin: 10.9 })).toContain('hace 10 min');
    expect(armarAviso({ tipo: 'espera', esperaMin: -3 })).toContain('hace 0 min');
  });
});

describe('armarAviso — 12d: aviso sin traspaso (NTF8)', () => {
  const ENLACE_AVISO = 'https://chat.ejemplo.co/app/accounts/1/conversations/7';

  it('NTF8 — Pedir una persona avisa y el texto lo dice, con el enlace', () => {
    const texto = armarAviso({ tipo: 'aviso', motivo: 'pide-persona', enlace: ENLACE_AVISO });

    expect(texto).toContain('pidió hablar con una persona');
    expect(texto).toContain(`Atender: ${ENLACE_AVISO}`);
  });

  it('NTF8 — La herramienta derivar_a_asesor tiene su propio texto, sin datos del cliente ni del modelo', () => {
    const delModelo = armarAviso({ tipo: 'aviso', motivo: 'pide-asesor', enlace: ENLACE_AVISO });
    const delCliente = armarAviso({ tipo: 'aviso', motivo: 'pide-persona', enlace: ENLACE_AVISO });

    expect(delModelo).not.toBe(delCliente);
    for (const texto of [delModelo, delCliente]) {
      expect(texto).not.toMatch(/\d{7,}/);
      expect(texto).not.toContain('@');
    }
  });

  it('NTF8 — El audio repetido avisa sin traspasar: el texto dice que el cliente insiste con audios', () => {
    const texto = armarAviso({ tipo: 'aviso', motivo: 'audio-repetido' });

    expect(texto).toContain('insiste con audios');
    expect(texto).not.toContain('Traspaso');
  });

  it('NTF8 — El aviso deja claro que el bot sigue atendiendo', () => {
    expect(armarAviso({ tipo: 'aviso', motivo: 'pide-asesor' })).toContain('El bot sigue atendiendo');
  });

  it('NTF8 — Sin enlace el aviso sale igual, sin la línea de atender', () => {
    expect(armarAviso({ tipo: 'aviso', motivo: 'pide-persona' })).not.toContain('Atender');
  });
});
