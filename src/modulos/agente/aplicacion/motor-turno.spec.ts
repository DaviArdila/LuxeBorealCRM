import type { SolicitudTurno } from '../../conversaciones/index.js';
import type { DecisionPolitica, PoliticaTurno } from '../dominio/politica-turno.js';
import { ContadoresSesionEnMemoria } from '../../../../test/fakes/contadores-sesion-en-memoria.js';
import { RepositorioParametroAgenteEnMemoria } from '../../../../test/fakes/repositorio-parametro-agente-en-memoria.js';
import { MotorTurno } from './motor-turno.js';
import { PoliticaNoTextuales } from './politicas/politica-no-textuales.js';
import { TextoHandoff } from './texto-handoff.js';
import { ContenidoEcoProvisional } from './politicas/contenido-eco-provisional.js';

const AVISO = 'Soy un asistente automatizado.';

function solicitudDeTexto(texto: string, version = 0): SolicitudTurno {
  return {
    contexto: {
      conversacionId: 'conv-1',
      contactoId: 'contacto-1',
      canal: 'whatsapp',
      version,
      capacidades: { mensajeSalienteCuesta: true, admiteImagen: true },
    },
    mensajes: [{ idMensaje: 'm1', tipoContenido: 'texto', texto }],
  };
}

function solicitudDeSticker(): SolicitudTurno {
  return {
    ...solicitudDeTexto(''),
    mensajes: [{ idMensaje: 'm1', tipoContenido: 'sticker', texto: '' }],
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

function crearMotor(politicas: readonly PoliticaTurno[]) {
  const contadores = new ContadoresSesionEnMemoria();
  const parametros = new RepositorioParametroAgenteEnMemoria();
  parametros.textos.set('aviso_datos', AVISO);
  return { motor: new MotorTurno(politicas, contadores, parametros), contadores, parametros };
}

describe('MotorTurno', () => {
  it('AGT1 — Un turno de texto llega hasta la generación de contenido', async () => {
    const previa = new PoliticaEspia({ decision: 'seguir' });
    const { motor } = crearMotor([previa, new ContenidoEcoProvisional()]);

    const respuesta = await motor.generar(solicitudDeTexto('hola', 1));

    expect(previa.consultas).toBe(1);
    expect(respuesta.pasos).toEqual([{ paso: 'eco-1', tipo: 'texto', texto: 'hola' }]);
  });

  it('AGT1 — la primera política que responde corta el resto del pipeline', async () => {
    const siguiente = new PoliticaEspia({ decision: 'seguir' });
    const { motor } = crearMotor([new PoliticaEspia(RESPUESTA_PREVIA), siguiente]);

    const respuesta = await motor.generar(solicitudDeTexto('hola', 1));

    expect(respuesta.pasos).toEqual([{ paso: 'previa-1', tipo: 'texto', texto: 'respuesta previa' }]);
    expect(siguiente.consultas).toBe(0);
  });

  it('AGT1 — Una política que responde corta el resto del pipeline', async () => {
    const parametros = new RepositorioParametroAgenteEnMemoria();
    const noTextuales = new PoliticaNoTextuales(
      new ContadoresSesionEnMemoria(),
      parametros,
      new TextoHandoff({ estaDentroDeHorario: () => Promise.resolve(true) }, parametros),
    );
    const tope = new PoliticaEspia({ decision: 'seguir' });
    const contenido = new PoliticaEspia({ decision: 'seguir' });
    const { motor } = crearMotor([noTextuales, tope, contenido]);
    const solicitud = solicitudDeTexto('', 1);
    const soloAudio: SolicitudTurno = {
      ...solicitud,
      mensajes: [{ idMensaje: 'm1', tipoContenido: 'audio', texto: '' }],
    };

    const respuesta = await motor.generar(soloAudio);

    expect(respuesta.pasos).toEqual([{ paso: 'audio-1', tipo: 'texto', texto: '[mensaje_pedir_texto_audio]' }]);
    expect(tope.consultas).toBe(0);
    expect(contenido.consultas).toBe(0);
  });

  it('AGT1 — un turno que ninguna política responde termina sin pasos', async () => {
    const { motor } = crearMotor([new PoliticaEspia({ decision: 'seguir' })]);

    const respuesta = await motor.generar(solicitudDeTexto('hola'));

    expect(respuesta).toEqual({ pasos: [] });
  });

  it('conserva el handoff que pide la política que responde', async () => {
    const pide: DecisionPolitica = {
      decision: 'responder',
      respuesta: { pasos: [], handoff: { motivo: 'tope-turnos' } },
      cuentaTurno: false,
    };
    const { motor } = crearMotor([new PoliticaEspia(pide)]);

    const respuesta = await motor.generar(solicitudDeTexto('hola'));

    expect(respuesta.handoff).toEqual({ motivo: 'tope-turnos' });
  });

  describe('aviso de datos (AGT2, R14) y registro del turno', () => {
    const SESION = { conversacionId: 'conv-1', version: 0 };

    it('AGT2 — La primera respuesta de la conversación lleva el aviso en el mismo mensaje', async () => {
      const { motor } = crearMotor([new ContenidoEcoProvisional()]);

      const respuesta = await motor.generar(solicitudDeTexto('hola'));

      expect(respuesta.pasos).toEqual([{ paso: 'eco-1', tipo: 'texto', texto: `${AVISO}\n\nhola` }]);
    });

    it('AGT2 — La segunda respuesta no repite el aviso', async () => {
      const { motor } = crearMotor([new ContenidoEcoProvisional()]);
      await motor.generar(solicitudDeTexto('hola'));

      const respuesta = await motor.generar(solicitudDeTexto('sigo aquí'));

      expect(respuesta.pasos).toEqual([{ paso: 'eco-1', tipo: 'texto', texto: 'sigo aquí' }]);
    });

    it('AGT2 — Una respuesta vacía no genera un mensaje solo para el aviso', async () => {
      const { motor, contadores } = crearMotor([new ContenidoEcoProvisional()]);

      const ignorado = await motor.generar(solicitudDeSticker());
      const primeraReal = await motor.generar(solicitudDeTexto('hola'));

      expect(ignorado.pasos).toEqual([]);
      expect(primeraReal.pasos).toEqual([{ paso: 'eco-1', tipo: 'texto', texto: `${AVISO}\n\nhola` }]);
      expect(await contadores.turnos(SESION)).toBe(1);
    });

    it('una sesión posterior de la misma conversación no repite el aviso aunque no tenga turnos', async () => {
      const { motor } = crearMotor([new ContenidoEcoProvisional()]);

      const respuesta = await motor.generar(solicitudDeTexto('hola', 1));

      expect(respuesta.pasos).toEqual([{ paso: 'eco-1', tipo: 'texto', texto: 'hola' }]);
    });

    it('registra el turno solo cuando la política que responde lo cuenta', async () => {
      const cuenta = crearMotor([new PoliticaEspia(RESPUESTA_PREVIA)]);
      await cuenta.motor.generar(solicitudDeTexto('hola'));
      const sinCuenta: DecisionPolitica = { decision: 'responder', respuesta: { pasos: [] }, cuentaTurno: false };
      const noCuenta = crearMotor([new PoliticaEspia(sinCuenta)]);
      await noCuenta.motor.generar(solicitudDeTexto('hola'));

      expect(await cuenta.contadores.turnos(SESION)).toBe(1);
      expect(await noCuenta.contadores.turnos(SESION)).toBe(0);
    });
  });
});
