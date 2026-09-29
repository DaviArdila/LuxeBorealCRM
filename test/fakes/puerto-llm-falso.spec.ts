import { ErrorPasarelaLlm } from '../../src/modulos/llm/dominio/error-pasarela-llm.js';
import type { SolicitudGeneracion } from '../../src/modulos/llm/puertos/llm-port.js';
import { FakePuertoLlm } from './puerto-llm-falso.js';

function solicitud(texto: string): SolicitudGeneracion {
  return { perfil: 'conversacion', mensajes: [{ rol: 'usuario', texto }] };
}

describe('test/fakes — FakePuertoLlm', () => {
  it('devuelve las respuestas programadas en orden y registra cada solicitud', async () => {
    const llm = new FakePuertoLlm();
    llm.encolar({ respuesta: { texto: 'primera' } }, { respuesta: { texto: 'segunda' } });

    const primera = await llm.generar(solicitud('a'));
    const segunda = await llm.generar(solicitud('b'));

    expect(primera.texto).toBe('primera');
    expect(segunda.texto).toBe('segunda');
    expect(llm.solicitudes.map((s) => s.mensajes[0]?.texto)).toEqual(['a', 'b']);
  });

  it('deja visible el modelo con el que respondió cada paso (fallback observable)', async () => {
    const llm = new FakePuertoLlm();
    llm.encolar(
      { respuesta: { texto: 'x' }, modelo: 'modelo-a' },
      { respuesta: { texto: 'y' }, modelo: 'modelo-b' },
      { respuesta: { texto: 'z' } },
    );

    await llm.generar(solicitud('1'));
    await llm.generar(solicitud('2'));
    await llm.generar(solicitud('3'));

    expect(llm.modelosUsados).toEqual(['modelo-a', 'modelo-b', undefined]);
  });

  it('un paso de error lanza el ErrorPasarelaLlm programado', async () => {
    const llm = new FakePuertoLlm();
    const error = new ErrorPasarelaLlm('proveedor-caido');
    llm.encolar({ error });

    await expect(llm.generar(solicitud('a'))).rejects.toBe(error);
    expect(llm.solicitudes).toHaveLength(1);
  });

  it('sin pasos programados falla con un mensaje claro en vez de inventar una respuesta', async () => {
    const llm = new FakePuertoLlm();

    await expect(llm.generar(solicitud('a'))).rejects.toThrow(
      'FakePuertoLlm: no hay pasos programados',
    );
  });
});
