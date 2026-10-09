import type { MotivoAviso, SolicitudTurno } from '../../conversaciones/index.js';
import type { DecisionPolitica, EstadoTurno, PoliticaTurno } from '../dominio/politica-turno.js';
import { ContadoresSesionEnMemoria } from '../../../../test/fakes/contadores-sesion-en-memoria.js';
import { TextosAsistenteEnMemoria } from '../../../../test/fakes/textos-asistente-en-memoria.js';
import { MotorTurno } from './motor-turno.js';
import { PoliticaNoTextuales } from './politicas/politica-no-textuales.js';
import { PoliticaEco } from '../../../../test/fakes/politica-eco.js';

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

/** Deja pasar pidiendo un aviso, como `PoliticaPidePersona` (D6 de la Fase 12d). */
class PoliticaQueAvisa implements PoliticaTurno {
  constructor(private readonly motivo: MotivoAviso) {}

  evaluar(_solicitud: SolicitudTurno, turno: EstadoTurno): Promise<DecisionPolitica> {
    turno.avisoPedido = this.motivo;
    return Promise.resolve({ decision: 'seguir' });
  }
}

const RESPUESTA_PREVIA: DecisionPolitica = {
  decision: 'responder',
  respuesta: { pasos: [{ paso: 'previa-1', tipo: 'texto', texto: 'respuesta previa' }] },
  cuentaTurno: true,
};

function crearMotor(politicas: readonly PoliticaTurno[]) {
  const contadores = new ContadoresSesionEnMemoria();
  return { motor: new MotorTurno(politicas, contadores), contadores };
}

describe('MotorTurno', () => {
  it('AGT1 — Un turno de texto llega hasta la generación de contenido', async () => {
    const previa = new PoliticaEspia({ decision: 'seguir' });
    const { motor } = crearMotor([previa, new PoliticaEco()]);

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
    const parametros = new TextosAsistenteEnMemoria();
    const noTextuales = new PoliticaNoTextuales(new ContadoresSesionEnMemoria(), parametros);
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

  it('AGT1 — Una política que deja pasar con aviso lo suma a la respuesta final', async () => {
    const { motor } = crearMotor([new PoliticaQueAvisa('pide-persona'), new PoliticaEco()]);

    const respuesta = await motor.generar(solicitudDeTexto('hola', 1));

    expect(respuesta.pasos).toEqual([{ paso: 'eco-1', tipo: 'texto', texto: 'hola' }]);
    expect(respuesta.aviso).toEqual({ motivo: 'pide-persona' });
    expect(respuesta.handoff).toBeUndefined();
  });

  it('AGT1 — Con dos avisos en el turno gana el de mayor prioridad (lead-caliente sobre pide-persona)', async () => {
    const conLead: DecisionPolitica = {
      decision: 'responder',
      respuesta: { pasos: [], aviso: { motivo: 'lead-caliente' } },
      cuentaTurno: true,
    };
    const { motor } = crearMotor([new PoliticaQueAvisa('pide-persona'), new PoliticaEspia(conLead)]);

    const respuesta = await motor.generar(solicitudDeTexto('hola', 1));

    expect(respuesta.aviso).toEqual({ motivo: 'lead-caliente' });
  });

  it('AGT1 — Un turno sin aviso pedido no lleva aviso', async () => {
    const { motor } = crearMotor([new PoliticaEco()]);

    const respuesta = await motor.generar(solicitudDeTexto('hola', 1));

    expect(respuesta).not.toHaveProperty('aviso');
  });

  it('AGT1 — Si la respuesta pide handoff el aviso pedido se descarta (CNV11)', async () => {
    const pide: DecisionPolitica = {
      decision: 'responder',
      respuesta: { pasos: [], handoff: { motivo: 'tope-turnos' } },
      cuentaTurno: false,
    };
    const { motor } = crearMotor([new PoliticaQueAvisa('pide-persona'), new PoliticaEspia(pide)]);

    const respuesta = await motor.generar(solicitudDeTexto('hola', 1));

    expect(respuesta.handoff).toEqual({ motivo: 'tope-turnos' });
    expect(respuesta).not.toHaveProperty('aviso');
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

  describe('sin aviso fijo (R14) y registro del turno', () => {
    const SESION = { conversacionId: 'conv-1', version: 0 };

    it('R14 — El primer mensaje ya no lleva un aviso pegado por el código', async () => {
      const { motor } = crearMotor([new PoliticaEco()]);

      const respuesta = await motor.generar(solicitudDeTexto('hola'));

      expect(respuesta.pasos).toEqual([{ paso: 'eco-1', tipo: 'texto', texto: 'hola' }]);
    });

    it('R14 — Una respuesta vacía en el primer turno sigue sin pasos', async () => {
      const { motor, contadores } = crearMotor([new PoliticaEco()]);

      const ignorado = await motor.generar(solicitudDeSticker());
      const primeraReal = await motor.generar(solicitudDeTexto('hola'));

      expect(ignorado.pasos).toEqual([]);
      expect(primeraReal.pasos).toEqual([{ paso: 'eco-1', tipo: 'texto', texto: 'hola' }]);
      expect(await contadores.turnos(SESION)).toBe(1);
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
