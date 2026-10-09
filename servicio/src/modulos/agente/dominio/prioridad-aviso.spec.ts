import { elegirAviso } from './prioridad-aviso.js';

describe('modulos/agente/dominio — prioridad del aviso al asesor (D2 de la Fase 12d)', () => {
  it('AGT1 — Sin ningún aviso pedido no hay aviso', () => {
    expect(elegirAviso([undefined, undefined])).toBeUndefined();
  });

  it('AGT1 — Con un solo aviso gana ese', () => {
    expect(elegirAviso([undefined, 'audio-repetido'])).toBe('audio-repetido');
  });

  it('AGT1 — El orden de prioridad es lead-caliente, pide-persona, pide-asesor, audio-repetido', () => {
    expect(elegirAviso(['audio-repetido', 'pide-asesor', 'pide-persona', 'lead-caliente'])).toBe('lead-caliente');
    expect(elegirAviso(['audio-repetido', 'pide-asesor', 'pide-persona'])).toBe('pide-persona');
    expect(elegirAviso(['audio-repetido', 'pide-asesor'])).toBe('pide-asesor');
  });
});
