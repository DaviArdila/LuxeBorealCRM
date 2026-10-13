import { armarResumen } from './resumen.js';
import type { ResultadoAsercion } from './aserciones.js';

const OK = (nombre: ResultadoAsercion['nombre']): ResultadoAsercion => ({ nombre, ok: true, critica: false, detalle: '' });

describe('test/evals — armarResumen (EVL1 determinismo)', () => {
  it('EVL1 — Dos corridas guionadas dan el mismo resultado: ordena por id y no imprime tiempos ni texto', () => {
    const casos = [
      { id: 'b', titulo: 'Caso B', resultados: [OK('menciona')] },
      { id: 'a', titulo: 'Caso A', resultados: [OK('dineroConRastro'), { ...OK('handoff'), ok: false, detalle: 'handoff inesperado' }] },
    ];
    const veredicto = { aprobada: false, criticasFallidas: 0, porcentajeNoCriticas: 0.5 };

    const uno = armarResumen(casos, veredicto, 'guionado');
    const dos = armarResumen([...casos].reverse(), veredicto, 'guionado');

    expect(uno).toBe(dos);
    expect(uno.indexOf('a —')).toBeLessThan(uno.indexOf('b —'));
    expect(uno).toContain('handoff inesperado');
    expect(uno).not.toMatch(/\d+\s?ms/);
  });

  it('en modo real agrega el costo y el modelo de cada caso', () => {
    const resumen = armarResumen(
      [{ id: 'a', titulo: 'Caso A', resultados: [OK('menciona')] }],
      { aprobada: true, criticasFallidas: 0, porcentajeNoCriticas: 1 },
      'real',
      { costoUsd: 0.1234, modelosPorCaso: { a: ['openai:gpt-6-luna'] } },
    );

    expect(resumen).toContain('Costo estimado: 0.1234 USD');
    expect(resumen).toContain('openai:gpt-6-luna');
  });

  it('en modo real dice cuántos casos se omitieron y por qué', () => {
    const resumen = armarResumen(
      [{ id: 'a', titulo: 'Caso A', resultados: [OK('menciona')] }],
      { aprobada: true, criticasFallidas: 0, porcentajeNoCriticas: 1 },
      'real',
      { costoUsd: 0, modelosPorCaso: {}, omitidos: ['r1-x', 'r1-y'] },
    );

    expect(resumen).toContain('Casos omitidos: 2 (solo guionado: el LLM real no puede reproducir su guion): r1-x, r1-y');
  });

  it('sin casos omitidos no agrega la línea', () => {
    const resumen = armarResumen(
      [{ id: 'a', titulo: 'Caso A', resultados: [OK('menciona')] }],
      { aprobada: true, criticasFallidas: 0, porcentajeNoCriticas: 1 },
      'real',
      { costoUsd: 0, modelosPorCaso: {}, omitidos: [] },
    );

    expect(resumen).not.toContain('Casos omitidos');
  });
});

describe('test/evals — armarResumen con repeticiones (modo real)', () => {
  const FALLA: ResultadoAsercion = { nombre: 'menciona', ok: false, critica: false, detalle: 'no menciona: asesor' };
  const veredicto = { aprobada: false, criticasFallidas: 0, porcentajeNoCriticas: 0.5 };

  it('EVL3 — Una falla repetida se imprime una vez con en cuántas repeticiones ocurrió', () => {
    const porRepeticion = [[FALLA, OK('handoff')], [OK('menciona'), OK('handoff')], [FALLA, OK('handoff')]];
    const resumen = armarResumen(
      [{ id: 'a', titulo: 'Caso A', resultados: porRepeticion.flat(), porRepeticion }],
      veredicto,
      'real',
      { costoUsd: 0, modelosPorCaso: {} },
    );

    expect(resumen).toContain('a — Caso A: 4/6 aserciones, repeticiones sin fallas: 1/3');
    expect(resumen.match(/no menciona: asesor/g)).toHaveLength(1);
    expect(resumen).toContain('✗ menciona: no menciona: asesor — en 2 de 3 repeticiones');
  });

  it('EVL3 — Un caso que no terminó se nombra en el resumen', () => {
    const resumen = armarResumen([], veredicto, 'real', { costoUsd: 0, modelosPorCaso: {}, incompletos: ['b', 'a'] });

    expect(resumen).toContain('Casos sin terminar: 2 (se cortaron o fallaron antes de evaluar): a, b');
  });
});
