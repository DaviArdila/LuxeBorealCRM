import type { MensajeTurno, SolicitudTurno } from '../../../conversaciones/index.js';
import { ContenidoEcoProvisional } from './contenido-eco-provisional.js';

function solicitud(mensajes: readonly MensajeTurno[]): SolicitudTurno {
  return {
    contexto: {
      conversacionId: 'conv-1',
      contactoId: 'contacto-1',
      canal: 'whatsapp',
      version: 0,
      capacidades: { mensajeSalienteCuesta: true, admiteImagen: true },
    },
    mensajes,
  };
}

describe('ContenidoEcoProvisional', () => {
  it('hace eco del último mensaje de texto de la ráfaga', async () => {
    const decision = await new ContenidoEcoProvisional().evaluar(
      solicitud([
        { idMensaje: 'm1', tipoContenido: 'texto', texto: 'primero' },
        { idMensaje: 'm2', tipoContenido: 'audio', texto: '' },
        { idMensaje: 'm3', tipoContenido: 'texto', texto: 'último' },
      ]),
    );

    expect(decision).toEqual({
      decision: 'responder',
      respuesta: { pasos: [{ paso: 'eco-1', tipo: 'texto', texto: 'último' }] },
      cuentaTurno: true,
    });
  });

  it('sin ningún texto responde sin pasos y sin consumir turno', async () => {
    const decision = await new ContenidoEcoProvisional().evaluar(
      solicitud([{ idMensaje: 'm1', tipoContenido: 'sticker', texto: '' }]),
    );

    expect(decision).toEqual({ decision: 'responder', respuesta: { pasos: [] }, cuentaTurno: false });
  });
});
