import { HECHO_CAPTURA_PENDIENTE } from './hecho-captura.js';

// LDS4, R10 (Fase 12d): la captura fuera de horario se informa como un solo hecho, sin guion ni texto de cierre.

describe('modulos/leads/dominio — HECHO_CAPTURA_PENDIENTE', () => {
  it('LDS4 — Dice que está fuera de horario, que hay intención de compra y qué datos faltan', () => {
    expect(HECHO_CAPTURA_PENDIENTE).toMatch(/^Fuera de horario;/);
    expect(HECHO_CAPTURA_PENDIENTE).toMatch(/intención de compra/);
    expect(HECHO_CAPTURA_PENDIENTE).toContain('nombre completo');
    expect(HECHO_CAPTURA_PENDIENTE).toContain('teléfono de contacto');
    expect(HECHO_CAPTURA_PENDIENTE).toContain('dirección');
    expect(HECHO_CAPTURA_PENDIENTE).toContain('localidad');
  });

  it('LDS4 — No ordena qué pedir, en qué orden ni con qué texto despedirse', () => {
    expect(HECHO_CAPTURA_PENDIENTE).not.toMatch(/pídele|pide |solicita|uno a uno|despídete|texto exacto|guárdalos|guardar_datos_contacto|cuando los tenga/i);
    expect(HECHO_CAPTURA_PENDIENTE).not.toContain('"');
  });
});
