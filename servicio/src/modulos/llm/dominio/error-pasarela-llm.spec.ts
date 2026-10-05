import { CODIGOS_ERROR_PASARELA, ErrorPasarelaLlm } from './error-pasarela-llm.js';

describe('modulos/llm/dominio — ErrorPasarelaLlm (LLM1)', () => {
  it('declara exactamente los cinco códigos de causa de la spec', () => {
    expect([...CODIGOS_ERROR_PASARELA].sort()).toEqual(
      [
        'circuito-abierto',
        'no-reintentable',
        'proveedor-caido',
        'techo-alcanzado',
        'timeout',
      ].sort(),
    );
  });

  it('expone el código y el último modelo intentado sin inspeccionar el mensaje', () => {
    const error = new ErrorPasarelaLlm('timeout', 'openai/gpt-5.6-luna');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ErrorPasarelaLlm');
    expect(error.codigo).toBe('timeout');
    expect(error.modelo).toBe('openai/gpt-5.6-luna');
  });

  it('sin proveedor intentado no trae modelo', () => {
    const error = new ErrorPasarelaLlm('techo-alcanzado');

    expect(error.codigo).toBe('techo-alcanzado');
    expect(error.modelo).toBeUndefined();
  });

  it('el mensaje nombra la causa y nunca lleva contenido (R14)', () => {
    const error = new ErrorPasarelaLlm('no-reintentable', 'otro/modelo');

    expect(error.message).toBe('Pasarela LLM: no-reintentable (otro/modelo)');
    expect(new ErrorPasarelaLlm('circuito-abierto').message).toBe('Pasarela LLM: circuito-abierto');
  });
});
