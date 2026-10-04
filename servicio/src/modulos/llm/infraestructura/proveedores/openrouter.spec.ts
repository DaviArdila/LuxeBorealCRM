import { crearProveedorOpenRouter } from './openrouter.js';

const proveedor = crearProveedorOpenRouter({
  OPENROUTER_API_KEY: 'clave-de-prueba',
  OPENROUTER_BASE_URL: 'http://127.0.0.1:1/api/v1',
});

function usoSdk(entrada: number | undefined, salida: number | undefined, cache?: number) {
  return {
    inputTokens: entrada,
    outputTokens: salida,
    inputTokenDetails: { cacheReadTokens: cache },
  };
}

describe('modulos/llm/infraestructura/proveedores — OpenRouter', () => {
  it('se llama openrouter', () => {
    expect(proveedor.nombre).toBe('openrouter');
  });

  it('LLM18 — Un proveedor que incluye la caché en la entrada se separa', () => {
    const uso = proveedor.normalizarUso(usoSdk(1000, 200, 400), undefined);

    expect(uso).toEqual({ tokensEntrada: 600, tokensSalida: 200, tokensCache: 400 });
  });

  it('LLM18 — Un proveedor sin dato de caché reporta cero', () => {
    const uso = proveedor.normalizarUso(usoSdk(1000, 200), undefined);

    expect(uso).toEqual({ tokensEntrada: 1000, tokensSalida: 200, tokensCache: 0 });
  });

  it('prefiere la caché de los metadatos de OpenRouter sobre la del SDK', () => {
    const metadatos = { openrouter: { usage: { promptTokensDetails: { cachedTokens: 300 } } } };

    const uso = proveedor.normalizarUso(usoSdk(1000, 200, 100), metadatos);

    expect(uso).toEqual({ tokensEntrada: 700, tokensSalida: 200, tokensCache: 300 });
  });

  it('un uso sin dato de entrada ni de salida queda en cero', () => {
    expect(proveedor.normalizarUso(usoSdk(undefined, undefined), undefined)).toEqual({
      tokensEntrada: 0,
      tokensSalida: 0,
      tokensCache: 0,
    });
  });
});
