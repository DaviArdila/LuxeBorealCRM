import { RepositorioParametroAgenteEnMemoria } from '../../../../../test/fakes/repositorio-parametro-agente-en-memoria.js';
import type { SolicitudTurno } from '../../../conversaciones/index.js';
import type { RegistrarPidePersona } from '../../../leads/index.js';
import { TextoHandoff } from '../texto-handoff.js';
import { PoliticaPidePersona } from './politica-pide-persona.js';

// Escenarios AGT14 y LDS3 de `openspec/changes/archive/2026-09-30-fase-08-leads-handoff/specs/`.

function turno(...textos: string[]): SolicitudTurno {
  return {
    contexto: {
      conversacionId: 'conv-1',
      contactoId: 'contacto-1',
      canal: 'whatsapp',
      version: 0,
      capacidades: { mensajeSalienteCuesta: true, admiteImagen: true },
    },
    mensajes: textos.map((texto, i) => ({ idMensaje: `m${String(i)}`, tipoContenido: 'texto' as const, texto })),
  };
}

function crear(accion: 'derivar' | 'capturar' = 'derivar', dentroDeHorario = true) {
  const registros: { conversacionId: string; contactoId: string }[] = [];
  const registrar = {
    ejecutar: (entrada: { conversacionId: string; contactoId: string }) => {
      registros.push(entrada);
      return Promise.resolve({ accion, leadId: 'lead-1' });
    },
  } as unknown as RegistrarPidePersona;
  const horario = { estaDentroDeHorario: () => Promise.resolve(dentroDeHorario) };
  const politica = new PoliticaPidePersona(registrar, new TextoHandoff(horario, new RepositorioParametroAgenteEnMemoria()));
  return { politica, registros };
}

describe('modulos/agente/aplicacion/politicas — PoliticaPidePersona (AGT14, D6)', () => {
  it('AGT14 — La política corta el pipeline antes del LLM con el texto de handoff y el motivo pide-persona', async () => {
    const { politica, registros } = crear();

    const decision = await politica.evaluar(turno('pásame con un humano'));

    expect(decision).toEqual({
      decision: 'responder',
      respuesta: {
        pasos: [{ paso: 'handoff-1', tipo: 'texto', texto: '[mensaje_handoff]' }],
        handoff: { motivo: 'pide-persona' },
      },
      cuentaTurno: false,
    });
    expect(registros).toEqual([{ conversacionId: 'conv-1', contactoId: 'contacto-1' }]);
  });

  it('AGT14 — Un mensaje normal pasa al LLM y no registra ningún lead', async () => {
    const { politica, registros } = crear();

    await expect(politica.evaluar(turno('hola, busco un collar'))).resolves.toEqual({ decision: 'seguir' });
    expect(registros).toEqual([]);
  });

  it('LDS3 — Mencionar la palabra no es pedirla: sigue al LLM', async () => {
    const { politica } = crear();

    await expect(politica.evaluar(turno('¿el asesor de ustedes atiende los sábados?'))).resolves.toEqual({
      decision: 'seguir',
    });
  });

  it('LDS3 — Rechazar hablar con un bot también deriva', async () => {
    const { politica } = crear();

    const decision = await politica.evaluar(turno('no quiero hablar con un robot, pásame con alguien'));

    expect(decision).toMatchObject({ decision: 'responder', respuesta: { handoff: { motivo: 'pide-persona' } } });
  });

  it('detecta la petición en cualquiera de los mensajes de la ráfaga', async () => {
    const { politica } = crear();

    const decision = await politica.evaluar(turno('hola', 'quiero hablar con un asesor'));

    expect(decision).toMatchObject({ decision: 'responder' });
  });

  it('un turno sin texto no evalúa nada', async () => {
    const { politica, registros } = crear();

    const decision = await politica.evaluar({
      ...turno(),
      mensajes: [{ idMensaje: 'm1', tipoContenido: 'ubicacion', texto: '' }],
    });

    expect(decision).toEqual({ decision: 'seguir' });
    expect(registros).toEqual([]);
  });

  it('LDS4 — Fuera de horario el lead queda pendiente de captura y el turno sigue al LLM (T5 agrega la captura)', async () => {
    const { politica, registros } = crear('capturar', false);

    const decision = await politica.evaluar(turno('quiero hablar con un asesor'));

    expect(decision).toEqual({ decision: 'seguir' });
    expect(registros).toHaveLength(1);
  });
});
