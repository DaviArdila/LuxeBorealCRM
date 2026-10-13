import { describe, expect, it } from 'vitest';
import {
  PROVEEDORES_LLM_REGISTRADOS,
  resolverModelo,
  tieneProveedorRegistrado,
} from './resolver-modelo.js';

const registrados = PROVEEDORES_LLM_REGISTRADOS;

describe('resolverModelo', () => {
  it('registra solo los proveedores directos openai y anthropic (ADR-0029)', () => {
    expect([...registrados].sort()).toEqual(['anthropic', 'openai']);
  });

  it('LLM25 — Un id con prefijo anthropic: se llama directo a Anthropic', () => {
    expect(resolverModelo('anthropic:claude-haiku-5-5', registrados)).toEqual({
      proveedor: 'anthropic',
      modelo: 'claude-haiku-5-5',
    });
  });

  it('LLM15 — Un id con prefijo se llama directo al proveedor indicado', () => {
    expect(resolverModelo('openai:gpt-6-luna', registrados)).toEqual({
      proveedor: 'openai',
      modelo: 'gpt-6-luna',
    });
  });

  it('LLM16 — se corta en la primera dos puntos y el resto del id queda intacto', () => {
    expect(resolverModelo('openai:ft:gpt:org:id', registrados)).toEqual({
      proveedor: 'openai',
      modelo: 'ft:gpt:org:id',
    });
  });

  it.each([
    ['sin prefijo', 'modelo-simple'],
    ['con barra al estilo de OpenRouter', 'openai/gpt-6-luna'],
    ['con sufijo :free', 'meta-llama/llama-3-8b:free'],
    ['con prefijo desconocido', 'desconocido:modelo'],
    ['con prefijo openrouter retirado', 'openrouter:openai/gpt-6-luna'],
    ['vacío', ''],
  ])('LLM26 — un id %s es un error, nunca una llamada a un proveedor por defecto', (_caso, id) => {
    expect(() => resolverModelo(id, registrados)).toThrow(/proveedor registrado/);
  });

  it('LLM26 — el error nombra el id y los proveedores admitidos', () => {
    expect(() => resolverModelo('modelo-simple', registrados)).toThrow(
      'Id de modelo de LLM sin prefijo de proveedor registrado: "modelo-simple" (se admite openai:, anthropic:).',
    );
  });

  it('LLM16 — solo cuentan los proveedores que se le pasan como registrados', () => {
    expect(() => resolverModelo('openai:gpt-6-luna', ['anthropic'])).toThrow(/proveedor registrado/);
  });
});

describe('tieneProveedorRegistrado', () => {
  it('LLM26 — acepta solo ids con prefijo de un proveedor registrado', () => {
    expect(tieneProveedorRegistrado('openai:gpt-6-luna', registrados)).toBe(true);
    expect(tieneProveedorRegistrado('anthropic:claude-haiku-5-5', registrados)).toBe(true);
    expect(tieneProveedorRegistrado('openai/gpt-6-luna', registrados)).toBe(false);
    expect(tieneProveedorRegistrado('desconocido:modelo', registrados)).toBe(false);
    expect(tieneProveedorRegistrado('modelo-simple', registrados)).toBe(false);
    expect(tieneProveedorRegistrado('', registrados)).toBe(false);
  });
});
