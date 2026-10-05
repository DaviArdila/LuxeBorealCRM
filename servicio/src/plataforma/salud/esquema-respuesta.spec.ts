import { describe, expect, it } from 'vitest';
import { esquemaRespuestaSalud } from './esquema-respuesta.js';

describe('esquemaRespuestaSalud (D6, D4 de 00b)', () => {
  it('acepta una respuesta 200 con todos los indicadores arriba', () => {
    const resultado = esquemaRespuestaSalud.safeParse({
      status: 'ok',
      info: { postgres: { status: 'up' }, redis: { status: 'up' } },
      error: {},
      details: { postgres: { status: 'up' }, redis: { status: 'up' } },
    });

    expect(resultado.success).toBe(true);
  });

  it('acepta una respuesta 503 con un indicador caído', () => {
    const resultado = esquemaRespuestaSalud.safeParse({
      status: 'error',
      info: { postgres: { status: 'up' } },
      error: { redis: { status: 'down' } },
      details: { postgres: { status: 'up' }, redis: { status: 'down' } },
    });

    expect(resultado.success).toBe(true);
  });

  it('rechaza un status fuera del enum de Terminus', () => {
    const resultado = esquemaRespuestaSalud.safeParse({
      status: 'inventado',
      details: {},
    });

    expect(resultado.success).toBe(false);
  });

  it('rechaza un indicador sin status', () => {
    const resultado = esquemaRespuestaSalud.safeParse({
      status: 'ok',
      details: { postgres: {} },
    });

    expect(resultado.success).toBe(false);
  });
});
