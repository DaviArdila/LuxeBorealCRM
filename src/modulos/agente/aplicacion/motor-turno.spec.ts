import type { SolicitudTurno } from '../../conversaciones/index.js';
import type { DecisionPolitica, PoliticaTurno } from '../dominio/politica-turno.js';
import { MotorTurno } from './motor-turno.js';
import { ContenidoEcoProvisional } from './politicas/contenido-eco-provisional.js';

function solicitudDeTexto(texto: string): SolicitudTurno {
  return {
    contexto: {
      conversacionId: 'conv-1',
      contactoId: 'contacto-1',
      canal: 'whatsapp',
      version: 0,
      capacidades: { mensajeSalienteCuesta: true, admiteImagen: true },
    },
    mensajes: [{ idMensaje: 'm1', tipoContenido: 'texto', texto }],
  };
}

class PoliticaEspia implements PoliticaTurno {
  consultas = 0;

  constructor(private readonly decision: DecisionPolitica) {}

  evaluar(): Promise<DecisionPolitica> {
    this.consultas += 1;
    return Promise.resolve(this.decision);
  }
}

const RESPUESTA_PREVIA: DecisionPolitica = {
  decision: 'responder',
  respuesta: { pasos: [{ paso: 'previa-1', tipo: 'texto', texto: 'respuesta previa' }] },
  cuentaTurno: true,
};

describe('MotorTurno', () => {
  it('AGT1 — Un turno de texto llega hasta la generación de contenido', async () => {
    const previa = new PoliticaEspia({ decision: 'seguir' });
    const motor = new MotorTurno([previa, new ContenidoEcoProvisional()]);

    const respuesta = await motor.generar(solicitudDeTexto('hola'));

    expect(previa.consultas).toBe(1);
    expect(respuesta.pasos).toEqual([{ paso: 'eco-1', tipo: 'texto', texto: 'hola' }]);
  });

  it('AGT1 — la primera política que responde corta el resto del pipeline', async () => {
    const siguiente = new PoliticaEspia({ decision: 'seguir' });
    const motor = new MotorTurno([new PoliticaEspia(RESPUESTA_PREVIA), siguiente]);

    const respuesta = await motor.generar(solicitudDeTexto('hola'));

    expect(respuesta.pasos).toEqual([{ paso: 'previa-1', tipo: 'texto', texto: 'respuesta previa' }]);
    expect(siguiente.consultas).toBe(0);
  });

  it('AGT1 — un turno que ninguna política responde termina sin pasos', async () => {
    const motor = new MotorTurno([new PoliticaEspia({ decision: 'seguir' })]);

    const respuesta = await motor.generar(solicitudDeTexto('hola'));

    expect(respuesta).toEqual({ pasos: [] });
  });

  it('conserva el handoff que pide la política que responde', async () => {
    const pide: DecisionPolitica = {
      decision: 'responder',
      respuesta: { pasos: [], handoff: { motivo: 'tope-turnos' } },
      cuentaTurno: false,
    };
    const motor = new MotorTurno([new PoliticaEspia(pide)]);

    const respuesta = await motor.generar(solicitudDeTexto('hola'));

    expect(respuesta.handoff).toEqual({ motivo: 'tope-turnos' });
  });
});
