import { crearProveedorAnthropic } from './anthropic.js';

const proveedor = crearProveedorAnthropic({ ANTHROPIC_API_KEY: 'clave-de-prueba' });

// Forma del uso que el AI SDK arma desde la respuesta de Anthropic: `inputTokens` suma la entrada sin
// caché, la escritura en caché y la lectura de caché.
function usoSdk(entrada: number | undefined, salida: number | undefined, cache?: number) {
  return {
    inputTokens: entrada,
    outputTokens: salida,
    inputTokenDetails: { cacheReadTokens: cache },
  };
}

describe('modulos/llm/infraestructura/proveedores — Anthropic', () => {
  it('se llama anthropic', () => {
    expect(proveedor.nombre).toBe('anthropic');
  });

  it('LLM18 — Un proveedor que incluye la caché en la entrada se separa', () => {
    const uso = proveedor.normalizarUso(usoSdk(1000, 200, 400), undefined);

    expect(uso).toEqual({ tokensEntrada: 600, tokensSalida: 200, tokensCache: 400 });
  });

  it('LLM18 — la escritura en caché cuenta como entrada', () => {
    // 100 sin caché + 700 escritos en caché + 0 leídos: los 800 se cobran como entrada.
    const uso = proveedor.normalizarUso(usoSdk(800, 20, 0), undefined);

    expect(uso).toEqual({ tokensEntrada: 800, tokensSalida: 20, tokensCache: 0 });
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

  it('LLM25 — cada llamada pide esfuerzo de razonamiento bajo, sin presupuesto ni temperatura', () => {
    expect(proveedor.opcionesFijas).toEqual({ anthropic: { effort: 'low' } });
  });

  it('LLM25 — la caché se pide con un punto de corte en el prompt de sistema, no con una clave', () => {
    expect('opcionesDeCache' in proveedor).toBe(false);
    expect(proveedor.opcionesDelSistemaConCache).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
  });
});
