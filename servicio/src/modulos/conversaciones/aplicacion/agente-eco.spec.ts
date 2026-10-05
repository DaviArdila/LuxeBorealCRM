import { AgenteEco } from './agente-eco.js';
import type { ContextoTurno, MensajeTurno, SolicitudTurno } from '../puertos/generador-respuesta.js';

const CONTEXTO: ContextoTurno = {
  conversacionId: 'conv-1',
  contactoId: 'contacto-1',
  canal: 'whatsapp',
  version: 0,
  capacidades: { mensajeSalienteCuesta: true, admiteImagen: true },
};

function solicitud(mensajes: readonly MensajeTurno[]): SolicitudTurno {
  return { contexto: CONTEXTO, mensajes };
}

function texto(idMensaje: string, contenido: string): MensajeTurno {
  return { idMensaje, tipoContenido: 'texto', texto: contenido };
}

describe('modulos/conversaciones/aplicacion — AgenteEco', () => {
  it('CNV6 — El agente eco reenvía el texto del último mensaje del turno', async () => {
    const agente = new AgenteEco();

    const respuesta = await agente.generar(
      solicitud([texto('1', 'primero'), texto('2', 'segundo'), texto('3', 'último mensaje del turno')]),
    );

    expect(respuesta.pasos).toEqual([{ paso: 'eco-1', tipo: 'texto', texto: 'último mensaje del turno' }]);
    expect(respuesta.handoff).toBeUndefined();
  });

  it('ignora los mensajes no textuales: reenvía el último de tipo texto', async () => {
    const agente = new AgenteEco();

    const respuesta = await agente.generar(
      solicitud([texto('1', 'con texto'), { idMensaje: '2', tipoContenido: 'audio', texto: '' }]),
    );

    expect(respuesta.pasos).toEqual([{ paso: 'eco-1', tipo: 'texto', texto: 'con texto' }]);
  });

  it('con el turno vacío, responde con texto vacío en vez de lanzar', async () => {
    const agente = new AgenteEco();

    const respuesta = await agente.generar(solicitud([]));

    expect(respuesta.pasos).toEqual([{ paso: 'eco-1', tipo: 'texto', texto: '' }]);
  });
});
