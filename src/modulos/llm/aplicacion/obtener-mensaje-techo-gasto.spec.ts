import { RepositorioParametroLlmEnMemoria } from '../../../../test/fakes/repositorio-parametro-llm-en-memoria.js';
import { ObtenerMensajeTechoGasto } from './obtener-mensaje-techo-gasto.js';

describe('modulos/llm/aplicacion — ObtenerMensajeTechoGasto', () => {
  it('devuelve el texto de mensaje_techo_gasto que entrega el repositorio de parámetros', async () => {
    const parametros = new RepositorioParametroLlmEnMemoria();
    const caso = new ObtenerMensajeTechoGasto(parametros);

    await expect(caso.ejecutar()).resolves.toBe(await parametros.obtenerMensajeTechoGasto());
  });
});
