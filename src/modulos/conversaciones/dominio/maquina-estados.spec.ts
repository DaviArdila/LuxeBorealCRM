import { calcularTransicion, TransicionInvalida } from './maquina-estados.js';

// Títulos tomados literalmente de
// `openspec/changes/fase-05-conversaciones/specs/conversaciones/spec.md` (R6).

const HUMANO_TTL_HORAS = 3;
const HANDOFF_TTL_MIN = 45;

describe('modulos/conversaciones/dominio — calcularTransicion', () => {
  it('R6 — Un origen no permitido no puede devolver la conversación a bot', () => {
    expect(() =>
      calcularTransicion(
        'humano',
        'bot',
        'eco_humano',
        new Date('2026-09-28T12:00:00Z'),
        HUMANO_TTL_HORAS,
        HANDOFF_TTL_MIN,
      ),
    ).toThrow(TransicionInvalida);
  });

  it('R6 — Un origen no permitido no puede llevar la conversación a pausado', () => {
    expect(() =>
      calcularTransicion(
        'bot',
        'pausado',
        'eco_humano',
        new Date('2026-09-28T12:00:00Z'),
        HUMANO_TTL_HORAS,
        HANDOFF_TTL_MIN,
      ),
    ).toThrow(TransicionInvalida);
  });

  it('R6 — Un origen permitido devuelve la conversación a bot', () => {
    const resultado = calcularTransicion(
      'humano',
      'bot',
      'chatwoot_resolved',
      new Date('2026-09-28T12:00:00Z'),
      HUMANO_TTL_HORAS,
      HANDOFF_TTL_MIN,
    );

    expect(resultado.destino).toBe('bot');
    expect(resultado.expiraControlEn).toBeNull();
  });

  it('un destino bot/pausado con origen inválido lanza sin devolver ningún resultado', () => {
    expect(() =>
      calcularTransicion(
        'bot',
        'pausado',
        'chatwoot_resolved',
        new Date('2026-09-28T12:00:00Z'),
        HUMANO_TTL_HORAS,
        HANDOFF_TTL_MIN,
      ),
    ).toThrow(TransicionInvalida);
  });

  it('calcula expiraControlEn = ahora + HUMANO_TTL_HORAS al transicionar a humano', () => {
    const ahora = new Date('2026-09-28T12:00:00Z');

    const resultado = calcularTransicion('bot', 'humano', 'eco_humano', ahora, HUMANO_TTL_HORAS, HANDOFF_TTL_MIN);

    expect(resultado.expiraControlEn).toEqual(new Date('2026-09-28T15:00:00Z'));
  });

  it('calcula expiraControlEn = ahora + HANDOFF_TTL_MIN al transicionar a handoff_pendiente', () => {
    const ahora = new Date('2026-09-28T12:00:00Z');

    const resultado = calcularTransicion(
      'bot',
      'handoff_pendiente',
      'regla_handoff_explicita',
      ahora,
      HUMANO_TTL_HORAS,
      HANDOFF_TTL_MIN,
    );

    expect(resultado.expiraControlEn).toEqual(new Date('2026-09-28T12:45:00Z'));
  });
});
