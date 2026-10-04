import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';

import { SimuladorOpenRouter } from '../../soporte/simulador-openrouter.js';

// T1 (fase-06-pasarela-llm, D11d): verifica que `ai` + `@openrouter/ai-sdk-provider` cargan y
// funcionan bajo NestJS 12 ESM ("type": "module") contra un servidor local, sin API key real.

describe('llm — compatibilidad del AI SDK con NestJS 12 ESM', () => {
  let simulador: SimuladorOpenRouter;

  beforeAll(async () => {
    simulador = await SimuladorOpenRouter.iniciar();
  });

  afterAll(async () => {
    await simulador.cerrar();
  });

  it('generateText contra el simulador devuelve texto y el uso reportado', async () => {
    simulador.responderTexto('hola desde el simulador', {
      tokensEntrada: 12,
      tokensSalida: 5,
    });
    const openrouter = createOpenRouter({ baseURL: simulador.url, apiKey: 'clave-de-prueba' });

    const resultado = await generateText({
      model: openrouter('openai/gpt-5.6-luna'),
      system: 'Eres un asistente de pruebas.',
      messages: [{ role: 'user', content: 'hola' }],
      maxOutputTokens: 50,
    });

    expect(resultado.text).toBe('hola desde el simulador');
    expect(resultado.usage.inputTokens).toBe(12);
    expect(resultado.usage.outputTokens).toBe(5);
    expect(simulador.intentos).toBe(1);
  });

  it('el simulador recibe el modelo, el prompt de sistema y el tope de tokens pedidos', async () => {
    simulador.responderTexto('otra respuesta', { tokensEntrada: 3, tokensSalida: 2 });
    const openrouter = createOpenRouter({ baseURL: simulador.url, apiKey: 'clave-de-prueba' });

    await generateText({
      model: openrouter('otro/modelo'),
      system: 'Prompt de sistema distinto.',
      messages: [{ role: 'user', content: 'segunda pregunta' }],
      maxOutputTokens: 77,
    });

    const cuerpo = simulador.ultimoCuerpo();
    expect(cuerpo.model).toBe('otro/modelo');
    expect(cuerpo.max_tokens).toBe(77);
    expect(cuerpo.messages[0]).toEqual({
      role: 'system',
      content: [{ type: 'text', text: 'Prompt de sistema distinto.' }],
    });
    expect(cuerpo.messages[1]).toEqual({ role: 'user', content: 'segunda pregunta' });
  });
});
