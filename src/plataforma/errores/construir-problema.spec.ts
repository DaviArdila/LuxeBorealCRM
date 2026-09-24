import { describe, expect, it } from 'vitest';
import { construirProblema } from './construir-problema.js';

describe('construirProblema (D5, RFC 9457)', () => {
  it('construye type/title/status/codigo desde el catálogo, sin instance ni errores por defecto', () => {
    const problema = construirProblema('error-interno');

    expect(problema).toEqual({
      type: 'urn:luxeboreal:error:error-interno',
      title: 'Ocurrió un error inesperado',
      status: 500,
      codigo: 'error-interno',
    });
  });

  it('incluye instance y errores solo cuando el contexto los trae', () => {
    const problema = construirProblema('validacion-fallida', {
      instance: '/api/v1/ejemplos',
      errores: [{ campo: 'precioCop', problema: 'formato' }],
    });

    expect(problema.instance).toBe('/api/v1/ejemplos');
    expect(problema.errores).toEqual([{ campo: 'precioCop', problema: 'formato' }]);
  });

  it('nunca incluye el valor recibido: cada detalle solo tiene campo y problema', () => {
    const problema = construirProblema('validacion-fallida', {
      errores: [{ campo: 'precioCop', problema: 'formato' }],
    });

    expect(Object.keys(problema.errores?.[0] ?? {}).sort()).toEqual(['campo', 'problema']);
    expect(JSON.stringify(problema)).not.toContain('no-es-un-numero');
  });

  it('el código de error se mantiene estable para el mismo código (API4)', () => {
    const primero = construirProblema('validacion-fallida');
    const segundo = construirProblema('validacion-fallida');

    expect(segundo.codigo).toBe(primero.codigo);
    expect(segundo.type).toBe(primero.type);
    expect(segundo.status).toBe(primero.status);
  });
});
