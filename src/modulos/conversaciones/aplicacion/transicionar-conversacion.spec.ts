import type { SalidaCanal, SolicitudCambioEstado, SolicitudEtiquetas } from '../../canales/index.js';
import type { Configuracion } from '../../../plataforma/config/index.js';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import { TransicionInvalida } from '../dominio/maquina-estados.js';
import type { Conversacion, RepositorioConversacion } from '../puertos/repositorio-conversacion.js';
import { ConflictoDeVersionPersistente, TransicionarConversacion } from './transicionar-conversacion.js';

const CONFIGURACION_DE_PRUEBA = { HUMANO_TTL_HORAS: 3, HANDOFF_TTL_MIN: 45 } as Configuracion;

function conversacionDePrueba(sobrescribir: Partial<Conversacion> = {}): Conversacion {
  return {
    id: 'conv-1',
    contactoId: 'contacto-1',
    chatwootConversationId: 42,
    canal: 'whatsapp',
    estado: 'humano',
    expiraControlEn: null,
    version: 1,
    ...sobrescribir,
  };
}

/** Fake en memoria del puerto {@link RepositorioConversacion}, sin Prisma ni Postgres real. */
class RepositorioConversacionFalso implements RepositorioConversacion {
  llamadasATransicionar: Array<{ id: string; versionLeida: number }> = [];
  private respuestasTransicionar: Array<Conversacion | null> = [];
  filaFresca: Conversacion | null = null;

  programarRespuestas(...respuestas: Array<Conversacion | null>): void {
    this.respuestasTransicionar = respuestas;
  }

  obtenerPorConversacionCanal(): Promise<Conversacion | null> {
    throw new Error('no usado en este test');
  }

  obtenerOCrear(): Promise<Conversacion> {
    throw new Error('no usado en este test');
  }

  obtenerPorId(): Promise<Conversacion | null> {
    return Promise.resolve(this.filaFresca);
  }

  transicionar(id: string, versionLeida: number): Promise<Conversacion | null> {
    this.llamadasATransicionar.push({ id, versionLeida });
    const respuesta = this.respuestasTransicionar.shift();
    return Promise.resolve(respuesta ?? null);
  }

  listarVencidas(): Promise<readonly Conversacion[]> {
    return Promise.resolve([]);
  }
}

/** Doble de {@link SalidaCanal}: solo interesa el espejo del estado (CNV8). */
class SalidaCanalFalsa implements SalidaCanal {
  estados: SolicitudCambioEstado[] = [];
  etiquetas: SolicitudEtiquetas[] = [];

  enviarMensajes(): Promise<void> {
    return Promise.resolve();
  }

  cambiarEstado(solicitud: SolicitudCambioEstado): Promise<void> {
    this.estados.push(solicitud);
    return Promise.resolve();
  }

  agregarEtiquetas(solicitud: SolicitudEtiquetas): Promise<void> {
    this.etiquetas.push(solicitud);
    return Promise.resolve();
  }
}

function crearCasoDeUso(
  repositorio: RepositorioConversacionFalso,
  clock: ClockFalso,
  salida: SalidaCanal = new SalidaCanalFalsa(),
) {
  return new TransicionarConversacion(repositorio, clock, CONFIGURACION_DE_PRUEBA, salida);
}

describe('modulos/conversaciones/aplicacion — TransicionarConversacion', () => {
  it('transiciona con éxito en el primer intento, sin releer', async () => {
    const repositorio = new RepositorioConversacionFalso();
    const conversacion = conversacionDePrueba();
    const actualizada = conversacionDePrueba({ estado: 'bot', version: 2 });
    repositorio.programarRespuestas(actualizada);
    const casoDeUso = crearCasoDeUso(repositorio, new ClockFalso(new Date('2026-09-28T12:00:00Z')));

    const resultado = await casoDeUso.ejecutar(conversacion, 'bot', 'chatwoot_resolved');

    expect(resultado).toEqual(actualizada);
    expect(repositorio.llamadasATransicionar).toHaveLength(1);
    expect(repositorio.llamadasATransicionar[0]).toEqual({ id: 'conv-1', versionLeida: 1 });
  });

  it('D2 — un conflicto de versión relee el estado fresco y reintenta una vez', async () => {
    const repositorio = new RepositorioConversacionFalso();
    const conversacion = conversacionDePrueba();
    const fresca = conversacionDePrueba({ version: 2 });
    const actualizada = conversacionDePrueba({ estado: 'bot', version: 3 });
    repositorio.filaFresca = fresca;
    repositorio.programarRespuestas(null, actualizada);
    const casoDeUso = crearCasoDeUso(repositorio, new ClockFalso(new Date('2026-09-28T12:00:00Z')));

    const resultado = await casoDeUso.ejecutar(conversacion, 'bot', 'chatwoot_resolved');

    expect(resultado).toEqual(actualizada);
    expect(repositorio.llamadasATransicionar).toHaveLength(2);
    expect(repositorio.llamadasATransicionar[1]).toEqual({ id: 'conv-1', versionLeida: 2 });
  });

  it('D2 — un segundo conflicto de versión lanza ConflictoDeVersionPersistente', async () => {
    const repositorio = new RepositorioConversacionFalso();
    const conversacion = conversacionDePrueba();
    repositorio.filaFresca = conversacionDePrueba({ version: 2 });
    repositorio.programarRespuestas(null, null);
    const casoDeUso = crearCasoDeUso(repositorio, new ClockFalso(new Date('2026-09-28T12:00:00Z')));

    await expect(casoDeUso.ejecutar(conversacion, 'bot', 'chatwoot_resolved')).rejects.toThrow(
      ConflictoDeVersionPersistente,
    );
    expect(repositorio.llamadasATransicionar).toHaveLength(2);
  });

  it('R6 — un origen no permitido lanza TransicionInvalida sin llamar al repositorio', async () => {
    const repositorio = new RepositorioConversacionFalso();
    const conversacion = conversacionDePrueba({ estado: 'bot' });
    const casoDeUso = crearCasoDeUso(repositorio, new ClockFalso(new Date('2026-09-28T12:00:00Z')));

    await expect(casoDeUso.ejecutar(conversacion, 'pausado', 'eco_humano')).rejects.toThrow(TransicionInvalida);
    expect(repositorio.llamadasATransicionar).toHaveLength(0);
  });

  it('CNV8 — La vuelta al bot por vencimiento se espeja como pendiente', async () => {
    const repositorio = new RepositorioConversacionFalso();
    const salida = new SalidaCanalFalsa();
    repositorio.programarRespuestas(conversacionDePrueba({ estado: 'bot', version: 4 }));
    const casoDeUso = crearCasoDeUso(repositorio, new ClockFalso(new Date('2026-09-28T12:00:00Z')), salida);

    await casoDeUso.ejecutar(conversacionDePrueba({ version: 3 }), 'bot', 'ttl');

    expect(salida.estados).toEqual([{ idConversacion: '42', idOperacion: 'espejo-v4', estado: 'pendiente' }]);
  });

  it('CNV8 — Una vuelta al bot que vino del canal no se espeja', async () => {
    const repositorio = new RepositorioConversacionFalso();
    const salida = new SalidaCanalFalsa();
    repositorio.programarRespuestas(conversacionDePrueba({ estado: 'bot', version: 2 }));
    const casoDeUso = crearCasoDeUso(repositorio, new ClockFalso(new Date('2026-09-28T12:00:00Z')), salida);

    await casoDeUso.ejecutar(conversacionDePrueba(), 'bot', 'chatwoot_resolved');

    expect(salida.estados).toEqual([]);
  });

  it('CNV8 — Pasar a handoff_pendiente se espeja como abierta con la versión nueva en la clave', async () => {
    const repositorio = new RepositorioConversacionFalso();
    const salida = new SalidaCanalFalsa();
    repositorio.programarRespuestas(conversacionDePrueba({ estado: 'handoff_pendiente', version: 8 }));
    const casoDeUso = crearCasoDeUso(repositorio, new ClockFalso(new Date('2026-09-28T12:00:00Z')), salida);

    await casoDeUso.ejecutar(conversacionDePrueba({ estado: 'bot', version: 7 }), 'handoff_pendiente', 'regla_handoff_explicita');

    expect(salida.estados).toEqual([{ idConversacion: '42', idOperacion: 'espejo-v8', estado: 'abierta' }]);
  });

  it('un conflicto de versión persistente no espeja nada', async () => {
    const repositorio = new RepositorioConversacionFalso();
    const salida = new SalidaCanalFalsa();
    repositorio.filaFresca = conversacionDePrueba({ version: 2 });
    repositorio.programarRespuestas(null, null);
    const casoDeUso = crearCasoDeUso(repositorio, new ClockFalso(new Date('2026-09-28T12:00:00Z')), salida);

    await expect(casoDeUso.ejecutar(conversacionDePrueba(), 'humano', 'eco_humano')).rejects.toThrow();

    expect(salida.estados).toEqual([]);
  });

  it('CNV11 — Lead caliente agrega su etiqueta en el canal', async () => {
    const repositorio = new RepositorioConversacionFalso();
    const salida = new SalidaCanalFalsa();
    repositorio.programarRespuestas(conversacionDePrueba({ estado: 'handoff_pendiente', version: 5 }));
    const casoDeUso = crearCasoDeUso(repositorio, new ClockFalso(new Date('2026-09-28T12:00:00Z')), salida);

    await casoDeUso.ejecutar(conversacionDePrueba({ estado: 'bot', version: 4 }), 'handoff_pendiente', 'lead_caliente');

    expect(salida.etiquetas).toEqual([
      { idConversacion: '42', idOperacion: 'etiqueta-lead-v5', etiquetas: ['lead-caliente'] },
    ]);
  });

  it('otro origen de handoff no agrega la etiqueta de lead', async () => {
    const repositorio = new RepositorioConversacionFalso();
    const salida = new SalidaCanalFalsa();
    repositorio.programarRespuestas(conversacionDePrueba({ estado: 'handoff_pendiente', version: 5 }));
    const casoDeUso = crearCasoDeUso(repositorio, new ClockFalso(new Date('2026-09-28T12:00:00Z')), salida);

    await casoDeUso.ejecutar(conversacionDePrueba({ estado: 'bot', version: 4 }), 'handoff_pendiente', 'regla_handoff_explicita');

    expect(salida.etiquetas).toEqual([]);
  });
});
