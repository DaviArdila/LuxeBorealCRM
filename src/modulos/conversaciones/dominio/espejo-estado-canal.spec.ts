import { espejoEstadoCanal } from './espejo-estado-canal.js';

describe('modulos/conversaciones/dominio — espejoEstadoCanal (CNV8, D3)', () => {
  it.each([
    ['handoff_pendiente', 'regla_handoff_explicita'],
    ['handoff_pendiente', 'lead_caliente'],
    ['humano', 'eco_humano'],
    ['humano', 'chatwoot_pending'],
  ] as const)('CNV8 — a %s con origen %s se espeja como abierta', (destino, origen) => {
    expect(espejoEstadoCanal(destino, origen)).toBe('abierta');
  });

  it.each(['ttl', 'admin'] as const)('CNV8 — La vuelta al bot con origen %s se espeja como pendiente', (origen) => {
    expect(espejoEstadoCanal('bot', origen)).toBe('pendiente');
  });

  it.each(['chatwoot_pending', 'chatwoot_resolved'] as const)(
    'CNV8 — Una vuelta al bot con origen %s no se espeja (vino del canal)',
    (origen) => {
      expect(espejoEstadoCanal('bot', origen)).toBeNull();
    },
  );

  it('CNV8 — pausado por el admin no se espeja', () => {
    expect(espejoEstadoCanal('pausado', 'admin')).toBeNull();
  });
});
