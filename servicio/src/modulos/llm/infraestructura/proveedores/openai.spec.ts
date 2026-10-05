import { crearProveedorOpenAi } from './openai.js';

const proveedor = crearProveedorOpenAi({ OPENAI_API_KEY: 'clave-de-prueba' });

function usoSdk(entrada: number | undefined, salida: number | undefined, cache?: number) {
  return {
    inputTokens: entrada,
    outputTokens: salida,
    inputTokenDetails: { cacheReadTokens: cache },
  };
}

describe('modulos/llm/infraestructura/proveedores — OpenAI', () => {
  it('se llama openai', () => {
    expect(proveedor.nombre).toBe('openai');
  });

  it('LLM18 — Un proveedor que incluye la caché en la entrada se separa', () => {
    const uso = proveedor.normalizarUso(usoSdk(1000, 200, 400), undefined);

    expect(uso).toEqual({ tokensEntrada: 600, tokensSalida: 200, tokensCache: 400 });
  });

  it('LLM18 — Un proveedor sin dato de caché reporta cero', () => {
    const uso = proveedor.normalizarUso(usoSdk(1000, 200), undefined);

    expect(uso).toEqual({ tokensEntrada: 1000, tokensSalida: 200, tokensCache: 0 });
  });

  it('un uso sin dato de entrada ni de salida queda en cero y nunca negativo', () => {
    expect(proveedor.normalizarUso(usoSdk(undefined, undefined), undefined)).toEqual({
      tokensEntrada: 0,
      tokensSalida: 0,
      tokensCache: 0,
    });
    expect(proveedor.normalizarUso(usoSdk(100, 1, 250), undefined).tokensEntrada).toBe(0);
  });
});
