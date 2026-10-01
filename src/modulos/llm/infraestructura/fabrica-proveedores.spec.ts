import { PROVEEDORES_LLM_REGISTRADOS } from '../dominio/resolver-modelo.js';
import { crearProveedoresUsados, NOMBRES_DE_PROVEEDORES_CONSTRUIBLES } from './fabrica-proveedores.js';

function config(conversacion: string[], evals: string[] = conversacion) {
  return {
    LLM_CONVERSACION_MODELOS: conversacion,
    LLM_EVALS_MODELOS: evals,
    OPENROUTER_API_KEY: 'clave-openrouter',
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    OPENAI_API_KEY: '',
  };
}

function nombres(...argumentos: Parameters<typeof config>): string[] {
  return crearProveedoresUsados(config(...argumentos)).map((proveedor) => proveedor.nombre);
}

describe('modulos/llm/infraestructura — fábrica de proveedores usados (LLM17)', () => {
  it('cada proveedor registrado tiene su constructor y viceversa', () => {
    expect([...NOMBRES_DE_PROVEEDORES_CONSTRUIBLES].sort()).toEqual(
      [...PROVEEDORES_LLM_REGISTRADOS].sort(),
    );
  });

  it('LLM17 — Un proveedor sin uso no se construye', () => {
    expect(nombres(['openai/gpt-5.6-luna', 'meta-llama/llama-3-8b:free'])).toEqual(['openrouter']);
  });

  it('un perfil con prefijo construye ese proveedor y solo los que algún perfil usa', () => {
    expect(nombres(['openai:gpt-6-luna'])).toEqual(['openai']);
    expect(nombres(['openai:gpt-6-luna', 'openai/gpt-5.6-luna'])).toEqual(['openrouter', 'openai']);
  });

  it('cuenta también los modelos del perfil de evals', () => {
    expect(nombres(['openai/gpt-5.6-luna'], ['openai:gpt-6-luna'])).toEqual(['openrouter', 'openai']);
  });
});
