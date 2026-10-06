import type { LlmPort, MensajeLlm, RespuestaGeneracion } from '../../../src/modulos/llm/index.js';
import { evaluarAserciones } from './aserciones.js';
import { GrabadorLlm } from './grabador-llm.js';

// Regresión: el bucle de herramientas pasa el MISMO array mutable a todas las llamadas, así que el
// grabador debe copiar los resultados al momento de cada llamada y no al armar la grabación.

function respuestaConLlamada(id: string, nombre: string): RespuestaGeneracion {
  return { llamadasHerramienta: [{ id, nombre, argumentos: {} }] };
}

describe('test/evals — GrabadorLlm', () => {
  it('acumula los resultados de todas las rondas aunque el bucle reutilice el mismo array', async () => {
    const mensajes: MensajeLlm[] = [{ rol: 'usuario', texto: 'envío y garantía' }];
    const guion: RespuestaGeneracion[] = [
      respuestaConLlamada('a', 'cotizar_envio'),
      respuestaConLlamada('b', 'consultar_caso'),
      { texto: 'Total $271.000 (259.000 + 12.000)' },
    ];
    const interno: LlmPort = { generar: () => Promise.resolve(guion.shift() as RespuestaGeneracion) };
    const grabador = new GrabadorLlm(interno);

    await grabador.generar({ perfil: 'conversacion', mensajes });
    mensajes.push({ rol: 'usuario', resultadosHerramienta: [{ idLlamada: 'a', nombre: 'cotizar_envio', resultado: { total: '$271.000', envio: '$12.000', producto: '$259.000' }, esError: false }] });
    await grabador.generar({ perfil: 'conversacion', mensajes });
    mensajes.push({ rol: 'usuario', resultadosHerramienta: [{ idLlamada: 'b', nombre: 'consultar_caso', resultado: { texto: 'Garantía' }, esError: false }] });
    await grabador.generar({ perfil: 'conversacion', mensajes });

    const grabacion = grabador.grabacion('Total $271.000 (259.000 + 12.000)', null);

    expect(grabacion.resultados.map((r) => r.nombre)).toEqual(['cotizar_envio', 'consultar_caso']);
    const [r] = evaluarAserciones(grabacion, { dineroConRastro: true });
    expect(r).toMatchObject({ nombre: 'dineroConRastro', ok: true });
  });
});
