import { ErrorModoEvals, leerModoEvals } from './modo-evals.js';

// Escenario EVL4 «El modo real sin clave se niega sin llamar» y el modo guionado por defecto (EVL1).

describe('test/evals — leerModoEvals (D6)', () => {
  it('sin EVALS_MODO el modo es guionado y no pide clave', () => {
    expect(leerModoEvals({})).toEqual({ modo: 'guionado' });
    expect(leerModoEvals({ EVALS_MODO: 'guionado', OPENAI_API_KEY: '' })).toEqual({ modo: 'guionado' });
  });

  it('EVL4 — El modo real sin clave se niega sin llamar', () => {
    expect(() => leerModoEvals({ EVALS_MODO: 'real', OPENAI_API_KEY: '' })).toThrow(ErrorModoEvals);
    expect(() => leerModoEvals({ EVALS_MODO: 'real' })).toThrow(/OPENAI_API_KEY/);
  });

  it('el modo real nunca corre en CI, aunque haya clave', () => {
    expect(() => leerModoEvals({ EVALS_MODO: 'real', OPENAI_API_KEY: 'sk-x', CI: 'true' })).toThrow(/CI/);
  });

  it('el modo real con clave y fuera de CI es válido', () => {
    expect(leerModoEvals({ EVALS_MODO: 'real', OPENAI_API_KEY: 'sk-x' })).toEqual({ modo: 'real' });
  });

  it('un modo desconocido se rechaza nombrando la variable', () => {
    expect(() => leerModoEvals({ EVALS_MODO: 'otro' })).toThrow(/EVALS_MODO/);
  });

  it('el error nunca copia la clave', () => {
    try {
      leerModoEvals({ EVALS_MODO: 'real', OPENAI_API_KEY: 'sk-secreta', CI: 'true' });
    } catch (error) {
      expect((error as Error).message).not.toContain('sk-secreta');
    }
  });
});

describe('test/evals — la clave exigida es la del proveedor del modelo elegido (LLM17, ADR-0029)', () => {
  const REAL = { EVALS_MODO: 'real' } as const;

  it('LLM17 — El modo real con un modelo openai: exige OPENAI_API_KEY y no la de Anthropic', () => {
    const perfil = { ...REAL, LLM_EVALS_MODELOS: 'openai:gpt-6-luna' };

    expect(() => leerModoEvals({ ...perfil, ANTHROPIC_API_KEY: 'sk-ant' })).toThrow(/OPENAI_API_KEY/);
    expect(leerModoEvals({ ...perfil, OPENAI_API_KEY: 'sk-oa' })).toEqual({ modo: 'real' });
  });

  it('LLM17 — El modo real con un modelo anthropic: exige ANTHROPIC_API_KEY', () => {
    const perfil = { ...REAL, LLM_EVALS_MODELOS: 'anthropic:claude-haiku-5-5' };

    expect(() => leerModoEvals({ ...perfil, OPENAI_API_KEY: 'sk-oa' })).toThrow(/ANTHROPIC_API_KEY/);
    expect(leerModoEvals({ ...perfil, ANTHROPIC_API_KEY: 'sk-ant' })).toEqual({ modo: 'real' });
  });

  it('un perfil mixto exige la clave de cada proveedor que usa', () => {
    const perfil = { ...REAL, LLM_EVALS_MODELOS: 'openai:gpt-6-luna, anthropic:claude-haiku-5-5' };

    expect(() => leerModoEvals({ ...perfil, OPENAI_API_KEY: 'sk-oa' })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => leerModoEvals({ ...perfil, ANTHROPIC_API_KEY: 'sk-ant' })).toThrow(/OPENAI_API_KEY/);
    expect(leerModoEvals({ ...perfil, ANTHROPIC_API_KEY: 'sk-ant', OPENAI_API_KEY: 'sk-oa' })).toEqual({
      modo: 'real',
    });
  });

  it('sin LLM_EVALS_MODELOS el modelo por defecto es openai: y pide su clave', () => {
    expect(() => leerModoEvals({ ...REAL, ANTHROPIC_API_KEY: 'sk-ant' })).toThrow(/OPENAI_API_KEY/);
  });

  it('LLM26 — un id sin prefijo de proveedor registrado se niega nombrando la variable, sin llamar', () => {
    expect(() =>
      leerModoEvals({ ...REAL, LLM_EVALS_MODELOS: 'openai/gpt-6-luna', OPENAI_API_KEY: 'sk-oa' }),
    ).toThrow(ErrorModoEvals);
    expect(() =>
      leerModoEvals({ ...REAL, LLM_EVALS_MODELOS: 'openai/gpt-6-luna', OPENAI_API_KEY: 'sk-oa' }),
    ).toThrow(/LLM_EVALS_MODELOS/);
  });

  it('el error de una clave que falta nunca copia la clave que sí está', () => {
    try {
      leerModoEvals({ ...REAL, LLM_EVALS_MODELOS: 'anthropic:claude-haiku-5-5', OPENAI_API_KEY: 'sk-secreta' });
    } catch (error) {
      expect((error as Error).message).not.toContain('sk-secreta');
    }
  });
});
