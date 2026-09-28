import { ProcesarTurno } from './procesar-turno.js';
import type { BufferTurno } from '../infraestructura/redis/buffer-turno.js';
import type { LockTurno } from '../infraestructura/redis/lock-turno.js';
import type { MensajeTurno, GeneradorRespuesta, RespuestaTurno } from '../puertos/generador-respuesta.js';
import type { Conversacion, RepositorioConversacion } from '../puertos/repositorio-conversacion.js';
import type { EnviarRespuestaTurno, PasoRespuesta } from '../puertos/salida-conversacion.js';

class LockTurnoFalso {
  bloqueadas = new Set<string>();
  liberaciones: string[] = [];
  siempreFalla = false;

  adquirir(idConversacion: string): Promise<boolean> {
    if (this.siempreFalla || this.bloqueadas.has(idConversacion)) return Promise.resolve(false);
    this.bloqueadas.add(idConversacion);
    return Promise.resolve(true);
  }

  liberar(idConversacion: string): Promise<void> {
    this.bloqueadas.delete(idConversacion);
    this.liberaciones.push(idConversacion);
    return Promise.resolve();
  }
}

class BufferTurnoFalso {
  private valores: string[] = [];

  constructor(valoresIniciales: readonly string[] = []) {
    this.valores = [...valoresIniciales];
  }

  push(_idConversacion: string, valor: string): Promise<void> {
    this.valores.push(valor);
    return Promise.resolve();
  }

  leerYVaciar(): Promise<readonly string[]> {
    const copia = this.valores;
    this.valores = [];
    return Promise.resolve(copia);
  }

  tamano(): Promise<number> {
    return Promise.resolve(this.valores.length);
  }

  vaciar(): Promise<void> {
    this.valores = [];
    return Promise.resolve();
  }
}

class RepositorioConversacionFalso implements Pick<RepositorioConversacion, 'obtenerPorId'> {
  constructor(private conversacion: Conversacion | null) {}

  obtenerPorId(): Promise<Conversacion | null> {
    return Promise.resolve(this.conversacion);
  }

  cambiarEstado(estado: Conversacion['estado']): void {
    if (this.conversacion) this.conversacion = { ...this.conversacion, estado };
  }
}

class GeneradorRespuestaFalso implements GeneradorRespuesta {
  llamadas: MensajeTurno[][] = [];

  generar(mensajes: readonly MensajeTurno[]): Promise<RespuestaTurno> {
    this.llamadas.push([...mensajes]);
    return Promise.resolve({ pasos: [{ paso: 'eco-1', texto: mensajes.at(-1)?.texto ?? '' }] });
  }
}

class EnviarRespuestaTurnoFalso implements EnviarRespuestaTurno {
  llamadas: { idConversacion: string; idRespuesta: string; pasos: readonly PasoRespuesta[] }[] = [];

  enviar(idConversacion: string, idRespuesta: string, pasos: readonly PasoRespuesta[]): Promise<void> {
    this.llamadas.push({ idConversacion, idRespuesta, pasos });
    return Promise.resolve();
  }
}

function conversacionDePrueba(estado: Conversacion['estado'] = 'bot'): Conversacion {
  return {
    id: 'conv-1',
    contactoId: 'contacto-1',
    chatwootConversationId: 42,
    estado,
    expiraControlEn: null,
    version: 0,
  };
}

function mensaje(texto: string): string {
  return JSON.stringify({ idMensaje: crypto.randomUUID(), texto } satisfies MensajeTurno);
}

describe('modulos/conversaciones/aplicacion — ProcesarTurno', () => {
  it('CNV1 — cuatro mensajes acumulados producen una sola invocación del generador', async () => {
    const buffer = new BufferTurnoFalso([mensaje('uno'), mensaje('dos'), mensaje('tres'), mensaje('cuatro')]);
    const repositorio = new RepositorioConversacionFalso(conversacionDePrueba('bot'));
    const generador = new GeneradorRespuestaFalso();
    const salida = new EnviarRespuestaTurnoFalso();
    const procesar = new ProcesarTurno(
      new LockTurnoFalso() as unknown as LockTurno,
      buffer as unknown as BufferTurno,
      repositorio as unknown as RepositorioConversacion,
      generador,
      salida,
    );

    const resultado = await procesar.ejecutar('conv-1', 'job-1');

    expect(resultado).toEqual({ reencolar: false });
    expect(generador.llamadas).toHaveLength(1);
    expect(generador.llamadas[0]).toHaveLength(4);
    expect(salida.llamadas).toHaveLength(1);
    expect(salida.llamadas[0].pasos).toEqual([{ paso: 'eco-1', texto: 'cuatro' }]);
  });

  it('R8 — dos procesamientos de la misma conversación no corren en paralelo: el segundo no adquiere el lock', async () => {
    const lock = new LockTurnoFalso();
    lock.siempreFalla = true;
    const buffer = new BufferTurnoFalso([mensaje('uno')]);
    const repositorio = new RepositorioConversacionFalso(conversacionDePrueba('bot'));
    const generador = new GeneradorRespuestaFalso();
    const salida = new EnviarRespuestaTurnoFalso();
    const procesar = new ProcesarTurno(
      lock as unknown as LockTurno,
      buffer as unknown as BufferTurno,
      repositorio as unknown as RepositorioConversacion,
      generador,
      salida,
    );

    const resultado = await procesar.ejecutar('conv-1', 'job-1');

    expect(resultado).toEqual({ reencolar: true }); // buffer no vacío ⇒ reencolar
    expect(generador.llamadas).toHaveLength(0);
    expect(salida.llamadas).toHaveLength(0);
  });

  it('con el lock ocupado y el buffer vacío, no reencola', async () => {
    const lock = new LockTurnoFalso();
    lock.siempreFalla = true;
    const buffer = new BufferTurnoFalso([]);
    const repositorio = new RepositorioConversacionFalso(conversacionDePrueba('bot'));
    const procesar = new ProcesarTurno(
      lock as unknown as LockTurno,
      buffer as unknown as BufferTurno,
      repositorio as unknown as RepositorioConversacion,
      new GeneradorRespuestaFalso(),
      new EnviarRespuestaTurnoFalso(),
    );

    const resultado = await procesar.ejecutar('conv-1', 'job-1');

    expect(resultado).toEqual({ reencolar: false });
  });

  it('CNV2 — el estado humano no invoca al generador y vacía el buffer', async () => {
    const buffer = new BufferTurnoFalso([mensaje('uno'), mensaje('dos')]);
    const repositorio = new RepositorioConversacionFalso(conversacionDePrueba('humano'));
    const generador = new GeneradorRespuestaFalso();
    const salida = new EnviarRespuestaTurnoFalso();
    const procesar = new ProcesarTurno(
      new LockTurnoFalso() as unknown as LockTurno,
      buffer as unknown as BufferTurno,
      repositorio as unknown as RepositorioConversacion,
      generador,
      salida,
    );

    await procesar.ejecutar('conv-1', 'job-1');

    expect(generador.llamadas).toHaveLength(0);
    expect(salida.llamadas).toHaveLength(0);
    expect(await buffer.tamano()).toBe(0);
  });

  it('libera el lock incluso si el generador lanza', async () => {
    const lock = new LockTurnoFalso();
    const buffer = new BufferTurnoFalso([mensaje('uno')]);
    const repositorio = new RepositorioConversacionFalso(conversacionDePrueba('bot'));
    const generador: GeneradorRespuesta = {
      generar: () => Promise.reject(new Error('falla del generador')),
    };
    const procesar = new ProcesarTurno(
      lock as unknown as LockTurno,
      buffer as unknown as BufferTurno,
      repositorio as unknown as RepositorioConversacion,
      generador,
      new EnviarRespuestaTurnoFalso(),
    );

    await expect(procesar.ejecutar('conv-1', 'job-1')).rejects.toThrow('falla del generador');
    expect(lock.liberaciones).toEqual(['conv-1']);
  });
});
