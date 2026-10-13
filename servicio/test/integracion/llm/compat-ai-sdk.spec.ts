import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

import { SimuladorOpenAi } from '../../soporte/simulador-openai.js';

// T1 (fase-06-pasarela-llm, D11d): verifica que `ai` y un provider del AI SDK (`@ai-sdk/openai`, desde
// ADR-0029) cargan y funcionan bajo NestJS 12 ESM ("type": "module") contra un servidor local, sin API
// key real.

describe('llm — compatibilidad del AI SDK con NestJS 12 ESM', () => {
  let simulador: SimuladorOpenAi;

  beforeAll(async () => {
    simulador = await SimuladorOpenAi.iniciar();
  });

  afterAll(async () => {
    await simulador.cerrar();
  });

  it('generateText contra el simulador devuelve texto y el uso reportado', async () => {
    simulador.responderTexto('hola desde el simulador', {
      tokensEntrada: 12,
      tokensSalida: 5,
    });
    const openai = createOpenAI({ baseURL: simulador.url, apiKey: 'clave-de-prueba' });

    const resultado = await generateText({
      model: openai('gpt-5.6-luna'),
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
    const openai = createOpenAI({ baseURL: simulador.url, apiKey: 'clave-de-prueba' });

    await generateText({
      model: openai('otro-modelo'),
      system: 'Prompt de sistema distinto.',
      messages: [{ role: 'user', content: 'segunda pregunta' }],
      maxOutputTokens: 77,
    });

    const { cuerpo } = simulador.ultima();
    expect(cuerpo.model).toBe('otro-modelo');
    expect(cuerpo['max_output_tokens']).toBe(77);
    expect(JSON.stringify(cuerpo.input[0])).toContain('Prompt de sistema distinto.');
    expect(JSON.stringify(cuerpo.input[1])).toContain('segunda pregunta');
  });
});
