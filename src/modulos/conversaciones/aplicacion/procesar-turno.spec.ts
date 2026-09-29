import { ProcesarTurno } from './procesar-turno.js';
import type { EstadoAtencion, OrigenTransicion } from '../dominio/maquina-estados.js';
import type { TransicionarConversacion } from './transicionar-conversacion.js';
import type { BufferTurno } from '../infraestructura/redis/buffer-turno.js';
import type { LockTurno } from '../infraestructura/redis/lock-turno.js';
import type {
  GeneradorRespuesta,
  MensajeTurno,
  RespuestaTurno,
  SolicitudTurno,
} from '../puertos/generador-respuesta.js';
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
  llamadas: SolicitudTurno[] = [];

  constructor(private readonly respuestaFija?: RespuestaTurno) {}

  generar(solicitud: SolicitudTurno): Promise<RespuestaTurno> {
    this.llamadas.push(solicitud);
    return Promise.resolve(
      this.respuestaFija ?? {
        pasos: [{ paso: 'eco-1', tipo: 'texto', texto: solicitud.mensajes.at(-1)?.texto ?? '' }],
      },
    );
  }
}

class EnviarRespuestaTurnoFalso implements EnviarRespuestaTurno {
  llamadas: { idConversacion: string; idRespuesta: string; pasos: readonly PasoRespuesta[]; conHandoff: boolean }[] =
    [];

  enviar(
    idConversacion: string,
    idRespuesta: string,
    pasos: readonly PasoRespuesta[],
    conHandoff = false,
  ): Promise<void> {
    this.llamadas.push({ idConversacion, idRespuesta, pasos, conHandoff });
    return Promise.resolve();
  }
}

/** Doble de `TransicionarConversacion`: registra las transiciones y el orden respecto del envío. */
class TransicionarConversacionFalso {
  llamadas: { conversacion: Conversacion; destino: EstadoAtencion; origen: OrigenTransicion }[] = [];

  ejecutar(conversacion: Conversacion, destino: EstadoAtencion, origen: OrigenTransicion): Promise<Conversacion> {
    this.llamadas.push({ conversacion, destino, origen });
    return Promise.resolve({ ...conversacion, estado: destino });
  }
}

function conversacionDePrueba(
  estado: Conversacion['estado'] = 'bot',
  sobrescribir: Partial<Conversacion> = {},
): Conversacion {
  return {
    id: 'conv-1',
    contactoId: 'contacto-1',
    chatwootConversationId: 42,
    canal: 'whatsapp',
    estado,
    expiraControlEn: null,
    version: 0,
    ...sobrescribir,
  };
}

function mensaje(texto: string, tipoContenido: MensajeTurno['tipoContenido'] = 'texto'): string {
  return JSON.stringify({ idMensaje: crypto.randomUUID(), tipoContenido, texto } satisfies MensajeTurno);
}

function crearProcesar(
  buffer: BufferTurnoFalso,
  conversacion: Conversacion,
  generador: GeneradorRespuesta,
  salida: EnviarRespuestaTurno,
): ProcesarTurno {
  return new ProcesarTurno(
    new LockTurnoFalso() as unknown as LockTurno,
    buffer as unknown as BufferTurno,
    new RepositorioConversacionFalso(conversacion) as unknown as RepositorioConversacion,
    generador,
    salida,
    new TransicionarConversacionFalso() as unknown as TransicionarConversacion,
  );
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
    new TransicionarConversacionFalso() as unknown as TransicionarConversacion,
  );

    const resultado = await procesar.ejecutar('conv-1', 'job-1');

    expect(resultado).toEqual({ reencolar: false });
    expect(generador.llamadas).toHaveLength(1);
    expect(generador.llamadas[0].mensajes).toHaveLength(4);
    expect(salida.llamadas).toHaveLength(1);
    expect(salida.llamadas[0].pasos).toEqual([{ paso: 'eco-1', tipo: 'texto', texto: 'cuatro' }]);
  });

  it('CNV8 — dos turnos de la misma conversación no comparten idRespuesta y el id cabe en el outbox', async () => {
    const buffer = new BufferTurnoFalso([mensaje('uno')]);
    const salida = new EnviarRespuestaTurnoFalso();
    const procesar = crearProcesar(buffer, conversacionDePrueba('bot'), new GeneradorRespuestaFalso(), salida);
    const idJob = 'turno-018f0a4e-7b2c-7c1a-9d3e-5a6b7c8d9e0f-respaldo-1a2b3c4d'; // el más largo (59)

    await procesar.ejecutar('conv-1', idJob);
    await buffer.push('conv-1', mensaje('dos'));
    await procesar.ejecutar('conv-1', idJob);

    const ids = salida.llamadas.map((llamada) => llamada.idRespuesta);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    }
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
    new TransicionarConversacionFalso() as unknown as TransicionarConversacion,
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
    new TransicionarConversacionFalso() as unknown as TransicionarConversacion,
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
    new TransicionarConversacionFalso() as unknown as TransicionarConversacion,
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
    new TransicionarConversacionFalso() as unknown as TransicionarConversacion,
  );

    await expect(procesar.ejecutar('conv-1', 'job-1')).rejects.toThrow('falla del generador');
    expect(lock.liberaciones).toEqual(['conv-1']);
  });

  it('CNV7 — El contexto del turno identifica la conversación, el contacto y la sesión', async () => {
    const buffer = new BufferTurnoFalso([mensaje('hola')]);
    const generador = new GeneradorRespuestaFalso();
    const procesar = crearProcesar(
      buffer,
      conversacionDePrueba('bot', { version: 2, canal: 'whatsapp' }),
      generador,
      new EnviarRespuestaTurnoFalso(),
    );

    await procesar.ejecutar('conv-1', 'job-1');

    expect(generador.llamadas[0].contexto).toEqual({
      conversacionId: 'conv-1',
      contactoId: 'contacto-1',
      canal: 'whatsapp',
      version: 2,
      capacidades: { mensajeSalienteCuesta: true, admiteImagen: true },
    });
  });

  it('CNV7 — Un canal sin perfil soportado recibe capacidades conservadoras', async () => {
    const buffer = new BufferTurnoFalso([mensaje('hola')]);
    const generador = new GeneradorRespuestaFalso();
    const procesar = crearProcesar(
      buffer,
      conversacionDePrueba('bot', { canal: 'otro' }),
      generador,
      new EnviarRespuestaTurnoFalso(),
    );

    await procesar.ejecutar('conv-1', 'job-1');

    expect(generador.llamadas[0].contexto.canal).toBe('otro');
    expect(generador.llamadas[0].contexto.capacidades).toEqual({
      mensajeSalienteCuesta: true,
      admiteImagen: true,
    });
  });

  it('un mensaje de audio del buffer llega al generador con su tipo y con el texto vacío', async () => {
    const buffer = new BufferTurnoFalso([mensaje('', 'audio')]);
    const generador = new GeneradorRespuestaFalso({ pasos: [] });
    const procesar = crearProcesar(buffer, conversacionDePrueba('bot'), generador, new EnviarRespuestaTurnoFalso());

    await procesar.ejecutar('conv-1', 'job-1');

    expect(generador.llamadas[0].mensajes).toEqual([expect.objectContaining({ tipoContenido: 'audio', texto: '' })]);
  });

  it('un mensaje viejo del buffer sin tipoContenido se lee como texto', async () => {
    const viejo = JSON.stringify({ idMensaje: 'viejo-1', texto: 'escrito antes del despliegue' });
    const buffer = new BufferTurnoFalso([viejo]);
    const generador = new GeneradorRespuestaFalso();
    const procesar = crearProcesar(buffer, conversacionDePrueba('bot'), generador, new EnviarRespuestaTurnoFalso());

    await procesar.ejecutar('conv-1', 'job-1');

    expect(generador.llamadas[0].mensajes).toEqual([
      { idMensaje: 'viejo-1', tipoContenido: 'texto', texto: 'escrito antes del despliegue' },
    ]);
  });

  it('CNV8 — Una respuesta sin pasos no envía ningún mensaje', async () => {
    const buffer = new BufferTurnoFalso([mensaje('hola')]);
    const generador = new GeneradorRespuestaFalso({ pasos: [] });
    const salida = new EnviarRespuestaTurnoFalso();
    const procesar = crearProcesar(buffer, conversacionDePrueba('bot'), generador, salida);

    await procesar.ejecutar('conv-1', 'job-1');

    expect(generador.llamadas).toHaveLength(1);
    expect(salida.llamadas).toHaveLength(0);
  });

  describe('CNV8 — handoff pedido por el generador', () => {
    function armar(respuesta: RespuestaTurno, estado: Conversacion['estado'] = 'bot') {
      const orden: string[] = [];
      const buffer = new BufferTurnoFalso([mensaje('hola')]);
      const repositorio = new RepositorioConversacionFalso(conversacionDePrueba(estado));
      const generador = new GeneradorRespuestaFalso(respuesta);
      const salida = new EnviarRespuestaTurnoFalso();
      const transicionar = new TransicionarConversacionFalso();
      const enviarOriginal = salida.enviar.bind(salida);
      salida.enviar = (...args) => {
        orden.push('enviar');
        return enviarOriginal(...args);
      };
      const ejecutarOriginal = transicionar.ejecutar.bind(transicionar);
      transicionar.ejecutar = (...args) => {
        orden.push('transicionar');
        return ejecutarOriginal(...args);
      };
      const procesar = new ProcesarTurno(
        new LockTurnoFalso() as unknown as LockTurno,
        buffer as unknown as BufferTurno,
        repositorio as unknown as RepositorioConversacion,
        generador,
        salida,
        transicionar as unknown as TransicionarConversacion,
      );
      return { procesar, buffer, repositorio, generador, salida, transicionar, orden };
    }

    const PASO: PasoRespuesta = { paso: 'p1', tipo: 'texto', texto: 'te paso con un asesor' };

    it('CNV8 — El generador pide handoff y la conversación queda esperando a un asesor', async () => {
      const { procesar, buffer, generador, salida, transicionar, orden } = armar({
        pasos: [PASO],
        handoff: { motivo: 'audio-repetido' },
      });

      await procesar.ejecutar('conv-1', 'job-1');

      expect(salida.llamadas[0].pasos).toEqual([PASO]);
      // El mensaje de handoff sale después de la transición: su guardia debe admitir ese estado.
      expect(salida.llamadas[0].conHandoff).toBe(true);
      expect(transicionar.llamadas).toHaveLength(1);
      const { conversacion, destino, origen } = transicionar.llamadas[0];
      expect({ id: conversacion.id, estado: conversacion.estado, destino, origen }).toEqual({
        id: 'conv-1',
        estado: 'bot',
        destino: 'handoff_pendiente',
        origen: 'regla_handoff_explicita',
      });
      expect(orden).toEqual(['enviar', 'transicionar']); // primero los pasos (R5), después la transición
      expect(generador.llamadas).toHaveLength(1);
      expect(await buffer.tamano()).toBe(0);
    });

    it('CNV8 — El motivo lead-caliente transiciona con origen lead_caliente', async () => {
      const { procesar, transicionar } = armar({ pasos: [], handoff: { motivo: 'lead-caliente' } });

      await procesar.ejecutar('conv-1', 'job-1');

      expect(transicionar.llamadas.map((l) => l.origen)).toEqual(['lead_caliente']);
    });

    it('CNV8 — Tras el handoff el turno sale del bucle aunque el buffer se haya llenado durante la generación', async () => {
      const { procesar, buffer, generador, transicionar } = armar({ pasos: [], handoff: { motivo: 'tope-turnos' } });
      const generarOriginal = generador.generar.bind(generador);
      generador.generar = async (solicitud) => {
        if (generador.llamadas.length >= 3) throw new Error('el bucle no salió tras el handoff');
        await buffer.push('conv-1', mensaje('llegó mientras se generaba'));
        return generarOriginal(solicitud);
      };

      await procesar.ejecutar('conv-1', 'job-1');

      expect(generador.llamadas).toHaveLength(1);
      expect(transicionar.llamadas).toHaveLength(1);
      expect(await buffer.tamano()).toBe(0); // el mensaje tardío se descarta: ya lo atiende un asesor
    });

    it('CNV8 — Si la conversación ya salió de bot mientras se generaba, el handoff no la pisa', async () => {
      const { procesar, generador, repositorio, transicionar, buffer } = armar({
        pasos: [],
        handoff: { motivo: 'audio-repetido' },
      });
      const generarOriginal = generador.generar.bind(generador);
      generador.generar = (solicitud) => {
        repositorio.cambiarEstado('humano'); // un asesor tomó la conversación durante la generación
        return generarOriginal(solicitud);
      };

      await procesar.ejecutar('conv-1', 'job-1');

      expect(transicionar.llamadas).toHaveLength(0);
      expect(await buffer.tamano()).toBe(0);
    });

    it('CNV8 — Sin handoff no se transiciona', async () => {
      const { procesar, transicionar } = armar({ pasos: [PASO] });

      await procesar.ejecutar('conv-1', 'job-1');

      expect(transicionar.llamadas).toHaveLength(0);
    });
  });
});
