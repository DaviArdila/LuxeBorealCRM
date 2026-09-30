import { ErrorModoEvals, leerModoEvals } from './modo-evals.js';

// Escenario EVL4 «El modo real sin clave se niega sin llamar» y el modo guionado por defecto (EVL1).

describe('test/evals — leerModoEvals (D6)', () => {
  it('sin EVALS_MODO el modo es guionado y no pide clave', () => {
    expect(leerModoEvals({})).toEqual({ modo: 'guionado' });
    expect(leerModoEvals({ EVALS_MODO: 'guionado', OPENROUTER_API_KEY: '' })).toEqual({ modo: 'guionado' });
  });

  it('EVL4 — El modo real sin clave se niega sin llamar', () => {
    expect(() => leerModoEvals({ EVALS_MODO: 'real', OPENROUTER_API_KEY: '' })).toThrow(ErrorModoEvals);
    expect(() => leerModoEvals({ EVALS_MODO: 'real' })).toThrow(/OPENROUTER_API_KEY/);
  });

  it('el modo real nunca corre en CI, aunque haya clave', () => {
    expect(() => leerModoEvals({ EVALS_MODO: 'real', OPENROUTER_API_KEY: 'sk-x', CI: 'true' })).toThrow(/CI/);
  });

  it('el modo real con clave y fuera de CI es válido', () => {
    expect(leerModoEvals({ EVALS_MODO: 'real', OPENROUTER_API_KEY: 'sk-x' })).toEqual({ modo: 'real' });
  });

  it('un modo desconocido se rechaza nombrando la variable', () => {
    expect(() => leerModoEvals({ EVALS_MODO: 'otro' })).toThrow(/EVALS_MODO/);
  });

  it('el error nunca copia la clave', () => {
    try {
      leerModoEvals({ EVALS_MODO: 'real', OPENROUTER_API_KEY: 'sk-secreta', CI: 'true' });
    } catch (error) {
      expect((error as Error).message).not.toContain('sk-secreta');
    }
  });
});

describe('test/evals — la clave exigida es la del proveedor del modelo elegido (LLM17, ADR-0019)', () => {
  const REAL = { EVALS_MODO: 'real' } as const;

  it('LLM17 — El modo real con un modelo openai: exige OPENAI_API_KEY y no la de OpenRouter', () => {
    const perfil = { ...REAL, LLM_EVALS_MODELOS: 'openai:gpt-6-luna' };

    expect(() => leerModoEvals({ ...perfil, OPENROUTER_API_KEY: 'sk-or' })).toThrow(/OPENAI_API_KEY/);
    expect(leerModoEvals({ ...perfil, OPENAI_API_KEY: 'sk-oa' })).toEqual({ modo: 'real' });
  });

  it('un perfil mixto exige la clave de cada proveedor que usa', () => {
    const perfil = { ...REAL, LLM_EVALS_MODELOS: 'openai:gpt-6-luna, openai/gpt-5.6-luna' };

    expect(() => leerModoEvals({ ...perfil, OPENAI_API_KEY: 'sk-oa' })).toThrow(/OPENROUTER_API_KEY/);
    expect(() => leerModoEvals({ ...perfil, OPENROUTER_API_KEY: 'sk-or' })).toThrow(/OPENAI_API_KEY/);
    expect(leerModoEvals({ ...perfil, OPENROUTER_API_KEY: 'sk-or', OPENAI_API_KEY: 'sk-oa' })).toEqual({
      modo: 'real',
    });
  });

  it('sin LLM_EVALS_MODELOS el modelo por defecto va a OpenRouter y pide su clave', () => {
    expect(() => leerModoEvals({ ...REAL, OPENAI_API_KEY: 'sk-oa' })).toThrow(/OPENROUTER_API_KEY/);
  });

  it('el error de una clave que falta nunca copia la clave que sí está', () => {
    try {
      leerModoEvals({ ...REAL, LLM_EVALS_MODELOS: 'openai:gpt-6-luna', OPENROUTER_API_KEY: 'sk-secreta' });
    } catch (error) {
      expect((error as Error).message).not.toContain('sk-secreta');
    }
  });
});
