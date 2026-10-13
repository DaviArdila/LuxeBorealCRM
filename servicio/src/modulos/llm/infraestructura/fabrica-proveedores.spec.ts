import { PROVEEDORES_LLM_REGISTRADOS } from '../dominio/resolver-modelo.js';
import { crearProveedoresUsados, NOMBRES_DE_PROVEEDORES_CONSTRUIBLES } from './fabrica-proveedores.js';

function config(conversacion: string[], evals: string[] = conversacion) {
  return {
    LLM_CONVERSACION_MODELOS: conversacion,
    LLM_EVALS_MODELOS: evals,
    OPENAI_API_KEY: '',
    ANTHROPIC_API_KEY: '',
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
    expect(nombres(['openai:gpt-6-luna', 'openai:gpt-6-luna-mini'])).toEqual(['openai']);
  });

  it('LLM26 — un id sin prefijo registrado no construye nada y lanza', () => {
    expect(() => nombres(['openai/gpt-6-luna'])).toThrow(/proveedor registrado/);
  });

  it('un perfil con prefijo anthropic: construye el proveedor Anthropic', () => {
    expect(nombres(['anthropic:claude-haiku-5-5'])).toEqual(['anthropic']);
    expect(nombres(['openai:gpt-6-luna'], ['anthropic:claude-haiku-5-5'])).toEqual(['openai', 'anthropic']);
  });

  it('cuenta también los modelos del perfil de evals', () => {
    expect(nombres(['anthropic:claude-haiku-5-5'], ['openai:gpt-6-luna'])).toEqual(['openai', 'anthropic']);
  });
});
