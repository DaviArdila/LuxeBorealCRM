import { TextosAsistenteEnMemoria } from '../../../../test/fakes/textos-asistente-en-memoria.js';
import { ObtenerMensajeTechoGasto } from './obtener-mensaje-techo-gasto.js';

describe('modulos/llm/aplicacion — ObtenerMensajeTechoGasto', () => {
  it('devuelve el texto del caso mensaje_techo_gasto que entrega el puerto de textos del asistente', async () => {
    const textos = new TextosAsistenteEnMemoria();
    textos.textos.set('mensaje_techo_gasto', 'TEXTO-DEL-TECHO');
    const caso = new ObtenerMensajeTechoGasto(textos);

    await expect(caso.ejecutar()).resolves.toBe('TEXTO-DEL-TECHO');
  });
});
