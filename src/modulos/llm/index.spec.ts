import * as barril from './index.js';

describe('modulos/llm — barril público', () => {
  it('expone el módulo, el puerto, el error tipado y sus códigos', () => {
    expect(Object.keys(barril).sort()).toEqual(
      ['CODIGOS_ERROR_PASARELA', 'ErrorPasarelaLlm', 'LLM_PORT', 'LlmModule', 'ObtenerMensajeTechoGasto'].sort(),
    );
    expect(barril.CODIGOS_ERROR_PASARELA).toContain('techo-alcanzado');
  });

  it('LLM11 — no deja salir el adaptador, el gateway ni los puertos internos', () => {
    const publicos = Object.keys(barril);

    for (const interno of [
      'AdaptadorOpenRouter',
      'ADAPTADOR_LLM',
      'LlmGateway',
      'TEMPORIZADOR_LLM',
      'REPOSITORIO_USO_LLM',
      'REPOSITORIO_PARAMETRO_LLM',
      'ULTIMO_RECURSO_LLM',
    ]) {
      expect(publicos).not.toContain(interno);
    }
  });
});
