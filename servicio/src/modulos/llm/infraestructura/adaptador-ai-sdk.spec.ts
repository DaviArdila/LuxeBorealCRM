import { MockLanguageModelV4 } from 'ai/test';
import type { SolicitudGeneracion } from '../puertos/llm-port.js';
import { AdaptadorAiSdk, type ProveedorLlm } from './adaptador-ai-sdk.js';

// Cómo el adaptador genérico arma la llamada con las opciones propias de cada proveedor (LLM18, LLM25):
// las fijas viajan siempre, las de caché solo con `claveCache`, y el prompt de sistema solo lleva
// opciones cuando el proveedor marca ahí su punto de corte.

const SOLICITUD: SolicitudGeneracion = {
  perfil: 'conversacion',
  systemPrompt: 'Eres el asistente de la tienda.',
  mensajes: [{ rol: 'usuario', texto: 'hola' }],
};

function modeloFalso(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: 'ok' }],
      finishReason: { unified: 'stop', raw: 'end_turn' },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 2, text: 2, reasoning: undefined },
      },
      warnings: [],
    },
  });
}

function proveedor(modelo: MockLanguageModelV4, extra: Partial<ProveedorLlm> = {}): ProveedorLlm {
  return {
    nombre: 'falso',
    crearModelo: () => modelo,
    normalizarUso: () => ({ tokensEntrada: 0, tokensSalida: 0, tokensCache: 0 }),
    ...extra,
  };
}

async function llamar(prov: ProveedorLlm, solicitud: SolicitudGeneracion = SOLICITUD): Promise<void> {
  await new AdaptadorAiSdk().generarConModelo(prov, 'modelo-x', solicitud, {
    maxTokens: 400,
    abort: new AbortController().signal,
  });
}

describe('modulos/llm/infraestructura — AdaptadorAiSdk y las opciones de cada proveedor', () => {
  it('sin opciones del proveedor el prompt de sistema viaja como texto y sin providerOptions', async () => {
    const modelo = modeloFalso();

    await llamar(proveedor(modelo), { ...SOLICITUD, claveCache: 'luxe-agente-v1' });

    const llamada = modelo.doGenerateCalls[0];
    expect(llamada?.prompt[0]).toEqual({ role: 'system', content: 'Eres el asistente de la tienda.' });
    expect(llamada?.providerOptions).toBeUndefined();
  });

  it('LLM25 — las opciones fijas viajan en cada llamada, con o sin clave de caché', async () => {
    const modelo = modeloFalso();
    const prov = proveedor(modelo, { opcionesFijas: { anthropic: { effort: 'low' } } });

    await llamar(prov);
    await llamar(prov, { ...SOLICITUD, claveCache: 'luxe-agente-v1' });

    expect(modelo.doGenerateCalls.map((llamada) => llamada.providerOptions)).toEqual([
      { anthropic: { effort: 'low' } },
      { anthropic: { effort: 'low' } },
    ]);
  });

  it('las opciones fijas y las de caché del mismo proveedor se combinan', async () => {
    const modelo = modeloFalso();
    const prov = proveedor(modelo, {
      opcionesFijas: { anthropic: { effort: 'low' } },
      opcionesDeCache: (clave) => ({ anthropic: { claveDePrueba: clave } }),
    });

    await llamar(prov, { ...SOLICITUD, claveCache: 'luxe-agente-v1' });

    expect(modelo.doGenerateCalls[0]?.providerOptions).toEqual({
      anthropic: { effort: 'low', claveDePrueba: 'luxe-agente-v1' },
    });
  });

  it('LLM25 — con clave de caché el prompt de sistema lleva el punto de corte del proveedor', async () => {
    const modelo = modeloFalso();
    const corte = { anthropic: { cacheControl: { type: 'ephemeral' } } };
    const prov = proveedor(modelo, { opcionesDelSistemaConCache: corte });

    await llamar(prov, { ...SOLICITUD, claveCache: 'luxe-agente-v1' });
    await llamar(prov);

    const [conClave, sinClave] = modelo.doGenerateCalls;
    expect(conClave?.prompt[0]).toEqual({
      role: 'system',
      content: 'Eres el asistente de la tienda.',
      providerOptions: corte,
    });
    expect(sinClave?.prompt[0]).toEqual({ role: 'system', content: 'Eres el asistente de la tienda.' });
  });
});
