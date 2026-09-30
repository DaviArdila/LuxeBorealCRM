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
      { costoUsd: 0.1234, modelosPorCaso: { a: ['openai/gpt-5.6-luna'] } },
    );

    expect(resumen).toContain('Costo estimado: 0.1234 USD');
    expect(resumen).toContain('openai/gpt-5.6-luna');
  });
});
