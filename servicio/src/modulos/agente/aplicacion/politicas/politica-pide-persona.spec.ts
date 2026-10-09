import type { SolicitudTurno } from '../../../conversaciones/index.js';
import type { RegistrarPidePersona } from '../../../leads/index.js';
import type { EstadoTurno } from '../../dominio/politica-turno.js';
import { PoliticaPidePersona } from './politica-pide-persona.js';

// Escenarios AGT14, LDS3 y LDS4 de `openspec/changes/fase-12d-derivar-sin-silencio/specs/` (T3).

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

function crear(accion: 'derivar' | 'capturar' = 'derivar') {
  const registros: { conversacionId: string; contactoId: string }[] = [];
  const registrar = {
    ejecutar: (entrada: { conversacionId: string; contactoId: string }) => {
      registros.push(entrada);
      return Promise.resolve({ accion, leadId: 'lead-1' });
    },
  } as unknown as RegistrarPidePersona;
  return { politica: new PoliticaPidePersona(registrar), registros };
}

describe('modulos/agente/aplicacion/politicas — PoliticaPidePersona (AGT14, D6)', () => {
  it('AGT14 — La política avisa y el turno llega al LLM', async () => {
    const { politica, registros } = crear();
    const estado: EstadoTurno = {};

    const decision = await politica.evaluar(turno('pásame con un humano'), estado);

    expect(decision).toEqual({ decision: 'seguir' });
    expect(estado.avisoPedido).toBe('pide-persona');
    expect(registros).toEqual([{ conversacionId: 'conv-1', contactoId: 'contacto-1' }]);
  });

  it('AGT14 — Un mensaje normal pasa al LLM sin aviso y no registra ningún lead', async () => {
    const { politica, registros } = crear();
    const estado: EstadoTurno = {};

    await expect(politica.evaluar(turno('hola, busco un collar'), estado)).resolves.toEqual({ decision: 'seguir' });

    expect(estado.avisoPedido).toBeUndefined();
    expect(registros).toEqual([]);
  });

  it('LDS3 — Petición explícita de hablar con una persona: avisa, registra el lead y el LLM responde', async () => {
    const { politica, registros } = crear();
    const estado: EstadoTurno = {};

    const decision = await politica.evaluar(turno('quiero hablar con un asesor'), estado);

    expect(decision).toEqual({ decision: 'seguir' });
    expect(estado.avisoPedido).toBe('pide-persona');
    expect(registros).toHaveLength(1);
  });

  it('LDS3 — Mencionar la palabra no es pedirla: sigue al LLM sin aviso', async () => {
    const { politica } = crear();
    const estado: EstadoTurno = {};

    await expect(politica.evaluar(turno('¿el asesor de ustedes atiende los sábados?'), estado)).resolves.toEqual({
      decision: 'seguir',
    });
    expect(estado.avisoPedido).toBeUndefined();
  });

  it('LDS3 — Rechazar hablar con un bot también avisa con pide-persona', async () => {
    const { politica } = crear();
    const estado: EstadoTurno = {};

    const decision = await politica.evaluar(turno('no quiero hablar con un robot, pásame con alguien'), estado);

    expect(decision).toEqual({ decision: 'seguir' });
    expect(estado.avisoPedido).toBe('pide-persona');
  });

  it('LDS3 — Pedir una persona sin cobertura sigue avisando (la política no consulta la cobertura)', async () => {
    const { politica } = crear();
    const estado: EstadoTurno = {};

    await politica.evaluar(turno('quiero hablar con un asesor, vivo lejos'), estado);

    expect(estado.avisoPedido).toBe('pide-persona');
  });

  it('detecta la petición en cualquiera de los mensajes de la ráfaga', async () => {
    const { politica } = crear();
    const estado: EstadoTurno = {};

    await politica.evaluar(turno('hola', 'quiero hablar con un asesor'), estado);

    expect(estado.avisoPedido).toBe('pide-persona');
  });

  it('un turno sin texto no evalúa nada', async () => {
    const { politica, registros } = crear();
    const estado: EstadoTurno = {};

    const decision = await politica.evaluar(
      { ...turno(), mensajes: [{ idMensaje: 'm1', tipoContenido: 'ubicacion', texto: '' }] },
      estado,
    );

    expect(decision).toEqual({ decision: 'seguir' });
    expect(estado.avisoPedido).toBeUndefined();
    expect(registros).toEqual([]);
  });

  it('LDS4 — Una petición de persona fuera de horario avisa de inmediato y el lead queda pendiente de captura', async () => {
    const { politica, registros } = crear('capturar');
    const estado: EstadoTurno = {};

    const decision = await politica.evaluar(turno('quiero hablar con un asesor'), estado);

    expect(decision).toEqual({ decision: 'seguir' });
    expect(estado.avisoPedido).toBe('pide-persona');
    expect(registros).toHaveLength(1);
  });
});
