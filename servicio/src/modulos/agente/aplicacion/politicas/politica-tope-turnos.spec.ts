import { ContadoresSesionEnMemoria } from '../../../../../test/fakes/contadores-sesion-en-memoria.js';
import { TextosAsistenteEnMemoria } from '../../../../../test/fakes/textos-asistente-en-memoria.js';
import type { SolicitudTurno } from '../../../conversaciones/index.js';
import { PoliticaTopeTurnos } from './politica-tope-turnos.js';

const TOPE = 3;

function turnoDeTexto(version: number): SolicitudTurno {
  return {
    contexto: {
      conversacionId: 'conv-1',
      contactoId: 'contacto-1',
      canal: 'whatsapp',
      version,
      capacidades: { mensajeSalienteCuesta: true, admiteImagen: true },
    },
    mensajes: [{ idMensaje: 'm1', tipoContenido: 'texto', texto: 'hola' }],
  };
}

function crear() {
  const contadores = new ContadoresSesionEnMemoria();
  const parametros = new TextosAsistenteEnMemoria();
  const politica = new PoliticaTopeTurnos(contadores, { AGENTE_TOPE_TURNOS: TOPE }, parametros);
  return { politica, contadores, parametros };
}

async function responderTurnos(contadores: ContadoresSesionEnMemoria, version: number, cuantos: number) {
  for (let i = 0; i < cuantos; i += 1) {
    await contadores.registrarTurno({ conversacionId: 'conv-1', version });
  }
}

describe('PoliticaTopeTurnos', () => {
  it('R13 — Tope de turnos alcanzado', async () => {
    const { politica, contadores } = crear();
    await responderTurnos(contadores, 0, TOPE);

    const decision = await politica.evaluar(turnoDeTexto(0));

    expect(decision).toEqual({
      decision: 'responder',
      respuesta: {
        pasos: [{ paso: 'handoff-1', tipo: 'texto', texto: '[mensaje_espera_handoff]' }],
        handoff: { motivo: 'tope-turnos' },
      },
      cuentaTurno: false,
    });
  });

  it('R13 — por debajo del tope el turno sigue al resto del pipeline', async () => {
    const { politica, contadores } = crear();
    await responderTurnos(contadores, 0, TOPE - 1);

    expect(await politica.evaluar(turnoDeTexto(0))).toEqual({ decision: 'seguir' });
  });

  it('R13 — Una sesión nueva reinicia el conteo de turnos', async () => {
    const { politica, contadores } = crear();
    await responderTurnos(contadores, 0, TOPE);
    expect(await politica.evaluar(turnoDeTexto(0))).toMatchObject({ decision: 'responder' });

    const decision = await politica.evaluar(turnoDeTexto(2));

    expect(decision).toEqual({ decision: 'seguir' });
    expect(await contadores.turnos({ conversacionId: 'conv-1', version: 2 })).toBe(0);
  });

  it('AGT3 — El tope de turnos responde con el texto de espera configurado, el mismo dentro y fuera de horario', async () => {
    const { politica, contadores, parametros } = crear();
    parametros.textos.set('mensaje_espera_handoff', 'Un asesor te atenderá en cuanto pueda.');
    await responderTurnos(contadores, 0, TOPE);

    const decision = await politica.evaluar(turnoDeTexto(0));

    expect(decision).toMatchObject({
      respuesta: {
        pasos: [{ texto: 'Un asesor te atenderá en cuanto pueda.' }],
        handoff: { motivo: 'tope-turnos' },
      },
    });
  });
});
