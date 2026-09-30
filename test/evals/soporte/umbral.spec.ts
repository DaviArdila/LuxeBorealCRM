import type { ResultadoAsercion } from './aserciones.js';
import { calcularVeredicto, REPETICIONES_REAL, UMBRAL_NO_CRITICAS_REAL } from './umbral.js';

// Escenarios EVL3 de `openspec/changes/archive/2026-09-30-fase-07c-evals/specs/agente/spec.md`.

function r(ok: boolean, critica: boolean): ResultadoAsercion {
  return { nombre: critica ? 'dineroConRastro' : 'menciona', ok, critica, detalle: '' };
}

describe('test/evals — calcularVeredicto (D7)', () => {
  it('las constantes del umbral coinciden con la spec (90 % y 3 repeticiones)', () => {
    expect(UMBRAL_NO_CRITICAS_REAL).toBe(0.9);
    expect(REPETICIONES_REAL).toBe(3);
  });

  it('EVL3 — Una aserción crítica fallida en modo real reprueba la corrida', () => {
    const resultados = [r(true, true), r(false, true), r(true, true), ...Array.from({ length: 20 }, () => r(true, false))];

    const veredicto = calcularVeredicto(resultados, 'real');

    expect(veredicto).toMatchObject({ aprobada: false, criticasFallidas: 1 });
  });

  it('EVL3 — El resto de aserciones tolera hasta un 10 % de fallos en modo real', () => {
    const noCriticas = [...Array.from({ length: 92 }, () => r(true, false)), ...Array.from({ length: 8 }, () => r(false, false))];

    const veredicto = calcularVeredicto([r(true, true), ...noCriticas], 'real');

    expect(veredicto.aprobada).toBe(true);
    expect(veredicto.porcentajeNoCriticas).toBeCloseTo(0.92);
  });

  it('en modo real, menos del 90 % de las no críticas reprueba', () => {
    const noCriticas = [...Array.from({ length: 89 }, () => r(true, false)), ...Array.from({ length: 11 }, () => r(false, false))];

    expect(calcularVeredicto(noCriticas, 'real').aprobada).toBe(false);
  });

  it('en modo guionado cualquier fallo, crítico o no, reprueba', () => {
    expect(calcularVeredicto([r(true, true), r(false, false)], 'guionado').aprobada).toBe(false);
    expect(calcularVeredicto([r(true, true), r(true, false)], 'guionado').aprobada).toBe(true);
  });

  it('sin aserciones no críticas el porcentaje es 1', () => {
    expect(calcularVeredicto([r(true, true)], 'real')).toMatchObject({ aprobada: true, porcentajeNoCriticas: 1 });
  });
});
