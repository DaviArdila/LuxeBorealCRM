import { AdaptadorLlmError } from './adaptador-llm.js';

describe('modulos/llm/puertos — AdaptadorLlmError (D2, LLM11)', () => {
  it('conserva la clase de reintento, la causa y el estado HTTP que el gateway necesita', () => {
    const error = new AdaptadorLlmError('reintentable', 'http', 429);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AdaptadorLlmError');
    expect(error.clase).toBe('reintentable');
    expect(error.causa).toBe('http');
    expect(error.estadoHttp).toBe(429);
  });

  it('un timeout no trae estado HTTP porque el proveedor nunca respondió', () => {
    const error = new AdaptadorLlmError('reintentable', 'timeout');

    expect(error.causa).toBe('timeout');
    expect(error.estadoHttp).toBeUndefined();
  });

  it('el mensaje solo describe la clase y la causa, nunca contenido (R14)', () => {
    expect(new AdaptadorLlmError('no-reintentable', 'http', 400).message).toBe(
      'Adaptador LLM: no-reintentable por http (400)',
    );
    expect(new AdaptadorLlmError('reintentable', 'sin-respuesta').message).toBe(
      'Adaptador LLM: reintentable por sin-respuesta',
    );
  });
});
