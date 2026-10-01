import { describe, expect, it } from 'vitest';
import {
  PROVEEDORES_LLM_REGISTRADOS,
  prefijoNoRegistrado,
  resolverModelo,
} from './resolver-modelo.js';

const registrados = PROVEEDORES_LLM_REGISTRADOS;

describe('resolverModelo', () => {
  it('registra hoy solo openrouter y openai (P37)', () => {
    expect([...registrados].sort()).toEqual(['openai', 'openrouter']);
  });

  it('LLM15 — Un id sin prefijo se llama a OpenRouter como hoy', () => {
    expect(resolverModelo('modelo-simple', registrados)).toEqual({
      proveedor: 'openrouter',
      modelo: 'modelo-simple',
    });
  });

  it('LLM15 — Un id con prefijo se llama directo al proveedor indicado', () => {
    expect(resolverModelo('openai:gpt-5.6-luna', registrados)).toEqual({
      proveedor: 'openai',
      modelo: 'gpt-5.6-luna',
    });
  });

  it('LLM15 — el prefijo openrouter explícito también se recorta', () => {
    expect(resolverModelo('openrouter:openai/gpt-5.6-luna', registrados)).toEqual({
      proveedor: 'openrouter',
      modelo: 'openai/gpt-5.6-luna',
    });
  });

  it('LLM16 — Un id de OpenRouter con barra no se toma por prefijo', () => {
    expect(resolverModelo('openai/gpt-5.6-luna', registrados)).toEqual({
      proveedor: 'openrouter',
      modelo: 'openai/gpt-5.6-luna',
    });
  });

  it('LLM16 — Un id de OpenRouter con sufijo :free no se toma por prefijo', () => {
    expect(resolverModelo('meta-llama/llama-3-8b:free', registrados)).toEqual({
      proveedor: 'openrouter',
      modelo: 'meta-llama/llama-3-8b:free',
    });
  });

  it('LLM16 — un prefijo con barra nunca cuenta aunque su inicio sea un proveedor', () => {
    expect(resolverModelo('openai/x:y', registrados)).toEqual({
      proveedor: 'openrouter',
      modelo: 'openai/x:y',
    });
  });

  it('LLM16 — se corta en la primera dos puntos y el resto del id queda intacto', () => {
    expect(resolverModelo('openai:ft:gpt:org:id', registrados)).toEqual({
      proveedor: 'openai',
      modelo: 'ft:gpt:org:id',
    });
  });

  it('LLM16 — un prefijo desconocido resuelve a OpenRouter con el id completo', () => {
    expect(resolverModelo('desconocido:modelo', registrados)).toEqual({
      proveedor: 'openrouter',
      modelo: 'desconocido:modelo',
    });
  });

  it('LLM16 — una cadena vacía resuelve a OpenRouter sin recortar', () => {
    expect(resolverModelo('', registrados)).toEqual({ proveedor: 'openrouter', modelo: '' });
  });

  it('LLM16 — solo cuentan los proveedores que se le pasan como registrados', () => {
    expect(resolverModelo('openai:gpt-5.6-luna', ['openrouter'])).toEqual({
      proveedor: 'openrouter',
      modelo: 'openai:gpt-5.6-luna',
    });
  });
});

describe('prefijoNoRegistrado', () => {
  it('LLM16 — devuelve el prefijo con forma de proveedor que no está registrado', () => {
    expect(prefijoNoRegistrado('desconocido:modelo', registrados)).toBe('desconocido');
  });

  it('LLM16 — no señala ids de OpenRouter, sin prefijo ni con prefijo registrado', () => {
    expect(prefijoNoRegistrado('openai/gpt-5.6-luna', registrados)).toBeNull();
    expect(prefijoNoRegistrado('meta-llama/llama-3-8b:free', registrados)).toBeNull();
    expect(prefijoNoRegistrado('modelo-simple', registrados)).toBeNull();
    expect(prefijoNoRegistrado('openai:gpt-5.6-luna', registrados)).toBeNull();
    expect(prefijoNoRegistrado('', registrados)).toBeNull();
  });
});
