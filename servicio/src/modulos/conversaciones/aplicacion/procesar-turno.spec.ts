import { Logger } from '@nestjs/common';
import type { SalidaCanal, SolicitudEtiquetas } from '../../canales/index.js';
import { MarcaAsesorAvisadoEnMemoria } from '../../../../test/fakes/marca-asesor-avisado-en-memoria.js';
import { RegistroObservadoresAviso, type EventoAviso } from './registro-observadores-aviso.js';
import { RegistroObservadoresHandoff, type EventoHandoff } from './registro-observadores-handoff.js';
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

/** Doble de {@link SalidaCanal}: solo interesan las etiquetas y los cambios de estado que se espejan (CNV11, CNV13). */
class SalidaCanalFalsa {
  etiquetas: SolicitudEtiquetas[] = [];
  estados: unknown[] = [];
  fallaEtiqueta = false;

  agregarEtiquetas(solicitud: SolicitudEtiquetas): Promise<void> {
    if (this.fallaEtiqueta) return Promise.reject(new Error('chatwoot caído'));
    this.etiquetas.push(solicitud);
    return Promise.resolve();
  }

  cambiarEstado(solicitud: unknown): Promise<void> {
    this.estados.push(solicitud);
    return Promise.resolve();
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
    new RegistroObservadoresHandoff(),
    new RegistroObservadoresAviso(),
    new MarcaAsesorAvisadoEnMemoria(),
    new SalidaCanalFalsa() as unknown as SalidaCanal,
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
    new RegistroObservadoresHandoff(),
    new RegistroObservadoresAviso(),
    new MarcaAsesorAvisadoEnMemoria(),
    new SalidaCanalFalsa() as unknown as SalidaCanal,
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
    new RegistroObservadoresHandoff(),
    new RegistroObservadoresAviso(),
    new MarcaAsesorAvisadoEnMemoria(),
    new SalidaCanalFalsa() as unknown as SalidaCanal,
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
    new RegistroObservadoresHandoff(),
    new RegistroObservadoresAviso(),
    new MarcaAsesorAvisadoEnMemoria(),
    new SalidaCanalFalsa() as unknown as SalidaCanal,
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
    new RegistroObservadoresHandoff(),
    new RegistroObservadoresAviso(),
    new MarcaAsesorAvisadoEnMemoria(),
    new SalidaCanalFalsa() as unknown as SalidaCanal,
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
    new RegistroObservadoresHandoff(),
    new RegistroObservadoresAviso(),
    new MarcaAsesorAvisadoEnMemoria(),
    new SalidaCanalFalsa() as unknown as SalidaCanal,
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
    function armar(
      respuesta: RespuestaTurno,
      estado: Conversacion['estado'] = 'bot',
      sobrescribir: Partial<Conversacion> = {},
    ) {
      const orden: string[] = [];
      const buffer = new BufferTurnoFalso([mensaje('hola')]);
      const repositorio = new RepositorioConversacionFalso(conversacionDePrueba(estado, sobrescribir));
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
      const observadores = new RegistroObservadoresHandoff();
      const eventos: EventoHandoff[] = [];
      observadores.registrar({
        alConfirmarHandoff: (evento) => {
          orden.push('observar');
          eventos.push(evento);
          return Promise.resolve();
        },
      });
      const procesar = new ProcesarTurno(
        new LockTurnoFalso() as unknown as LockTurno,
        buffer as unknown as BufferTurno,
        repositorio as unknown as RepositorioConversacion,
        generador,
        salida,
        transicionar as unknown as TransicionarConversacion,
        observadores,
        new RegistroObservadoresAviso(),
        new MarcaAsesorAvisadoEnMemoria(),
        new SalidaCanalFalsa() as unknown as SalidaCanal,
      );
      return { procesar, buffer, repositorio, generador, salida, transicionar, orden, observadores, eventos };
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
      expect(orden).toEqual(['enviar', 'transicionar', 'observar']); // primero los pasos (R5), después la transición y los observadores
      expect(generador.llamadas).toHaveLength(1);
      expect(await buffer.tamano()).toBe(0);
    });

    it('(transitorio hasta la T3 de 12d) CNV11 — Petición de persona pasa a handoff pendiente', async () => {
      const { procesar, transicionar, salida } = armar({ pasos: [PASO], handoff: { motivo: 'pide-persona' } });

      await procesar.ejecutar('conv-1', 'job-1');

      expect(salida.llamadas[0].conHandoff).toBe(true);
      expect(transicionar.llamadas.map((l) => [l.destino, l.origen])).toEqual([
        ['handoff_pendiente', 'regla_handoff_explicita'],
      ]);
    });

    it('(transitorio hasta la T3 de 12d) CNV11 — El aviso solo se encola tras confirmar la transición: los observadores corren después', async () => {
      const { procesar, orden, eventos } = armar({ pasos: [PASO], handoff: { motivo: 'lead-caliente' } });

      await procesar.ejecutar('conv-1', 'job-1');

      expect(orden).toEqual(['enviar', 'transicionar', 'observar']);
      expect(eventos).toEqual([
        { conversacionId: 'conv-1', contactoId: 'contacto-1', motivo: 'lead-caliente', version: 0 },
      ]);
    });

    it('NTF6 — El evento lleva la versión de la conversación antes de la transición, la de la sesión bot que termina', async () => {
      const { procesar, eventos } = armar({ pasos: [PASO], handoff: { motivo: 'tope-turnos' } }, 'bot', { version: 4 });

      await procesar.ejecutar('conv-1', 'job-1');

      expect(eventos).toEqual([{ conversacionId: 'conv-1', contactoId: 'contacto-1', motivo: 'tope-turnos', version: 4 }]);
    });

    it('NTF6 — Si la transición falla no se avisa a nadie', async () => {
      const { procesar, transicionar, eventos } = armar({ pasos: [PASO], handoff: { motivo: 'tope-turnos' } });
      transicionar.ejecutar = () => Promise.reject(new Error('conflicto de versión persistente'));

      await expect(procesar.ejecutar('conv-1', 'job-1')).rejects.toThrow('conflicto de versión persistente');

      expect(eventos).toEqual([]);
    });

    it('(transitorio hasta la T3 de 12d) CNV11 — Si la conversación ya no está en bot la transición no ocurre y no se avisa a nadie', async () => {
      const { procesar, eventos } = armar({ pasos: [PASO], handoff: { motivo: 'lead-caliente' } }, 'humano');

      await procesar.ejecutar('conv-1', 'job-1');

      expect(eventos).toEqual([]);
    });

    it('(transitorio hasta la T3 de 12d) CNV11 — Un observador que falla no revierte el handoff ni el vaciado del buffer', async () => {
      const { procesar, transicionar, buffer, observadores } = armar({ pasos: [], handoff: { motivo: 'lead-caliente' } });
      observadores.registrar({ alConfirmarHandoff: () => Promise.reject(new Error('fallo')) });

      await expect(procesar.ejecutar('conv-1', 'job-1')).resolves.toBeDefined();

      expect(transicionar.llamadas).toHaveLength(1);
      expect(await buffer.tamano()).toBe(0);
    });

    it('(transitorio hasta la T3 de 12d) CNV8 — El motivo lead-caliente transiciona con origen lead_caliente', async () => {
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

  describe('CNV13 — aviso al asesor sin traspaso', () => {
    const PASO: PasoRespuesta = { paso: 'p1', tipo: 'texto', texto: 'te ayudo yo mientras llega un asesor' };

    function armar(respuesta: RespuestaTurno | (() => RespuestaTurno), estado: Conversacion['estado'] = 'bot') {
      const orden: string[] = [];
      const buffer = new BufferTurnoFalso([mensaje('hola')]);
      const repositorio = new RepositorioConversacionFalso(conversacionDePrueba(estado));
      const generador = new GeneradorRespuestaFalso();
      generador.generar = (solicitud) => {
        generador.llamadas.push(solicitud);
        return Promise.resolve(typeof respuesta === 'function' ? respuesta() : respuesta);
      };
      const salida = new EnviarRespuestaTurnoFalso();
      const enviarOriginal = salida.enviar.bind(salida);
      salida.enviar = (...args) => {
        orden.push('enviar');
        return enviarOriginal(...args);
      };
      const transicionar = new TransicionarConversacionFalso();
      const observadoresAviso = new RegistroObservadoresAviso();
      const eventos: EventoAviso[] = [];
      observadoresAviso.registrar({
        alAvisarAsesor: (evento) => {
          orden.push('avisar');
          eventos.push(evento);
          return Promise.resolve();
        },
      });
      const marca = new MarcaAsesorAvisadoEnMemoria();
      const canal = new SalidaCanalFalsa();
      const crear = (bufferDelTurno: BufferTurnoFalso = buffer) =>
        new ProcesarTurno(
          new LockTurnoFalso() as unknown as LockTurno,
          bufferDelTurno as unknown as BufferTurno,
          repositorio as unknown as RepositorioConversacion,
          generador,
          salida,
          transicionar as unknown as TransicionarConversacion,
          new RegistroObservadoresHandoff(),
          observadoresAviso,
          marca,
          canal as unknown as SalidaCanal,
        );
      return {
        procesar: crear(),
        crear,
        buffer,
        repositorio,
        generador,
        salida,
        transicionar,
        observadoresAviso,
        eventos,
        marca,
        canal,
        orden,
      };
    }

    beforeEach(() => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('CNV13 — Avisar deja la conversación en bot', async () => {
      const { procesar, transicionar, canal, salida, eventos } = armar({ pasos: [PASO], aviso: { motivo: 'pide-asesor' } });

      await procesar.ejecutar('conv-1', 'job-1');

      expect(salida.llamadas).toHaveLength(1);
      expect(salida.llamadas[0].conHandoff).toBe(false);
      expect(eventos).toEqual([
        { conversacionId: 'conv-1', contactoId: 'contacto-1', motivo: 'pide-asesor', version: 0 },
      ]);
      expect(transicionar.llamadas).toHaveLength(0);
      expect(canal.estados).toEqual([]);
    });

    it('CNV13 — El siguiente mensaje del cliente se atiende con normalidad', async () => {
      const { procesar, buffer, generador } = armar({ pasos: [PASO], aviso: { motivo: 'pide-asesor' } });

      await procesar.ejecutar('conv-1', 'job-1');
      await buffer.push('conv-1', mensaje('otra cosa'));
      await procesar.ejecutar('conv-1', 'job-2');

      expect(generador.llamadas).toHaveLength(2);
    });

    it('CNV13 — Un asesor que ya tomó la conversación no recibe un aviso de más', async () => {
      const { procesar, generador, repositorio, eventos, marca } = armar({
        pasos: [PASO],
        aviso: { motivo: 'pide-persona' },
      });
      const generarOriginal = generador.generar.bind(generador);
      generador.generar = (solicitud) => {
        repositorio.cambiarEstado('humano'); // un asesor escribió mientras el generador corría
        return generarOriginal(solicitud);
      };

      await procesar.ejecutar('conv-1', 'job-1');

      expect(eventos).toEqual([]);
      expect(marca.puestas.size).toBe(0);
    });

    it('CNV13 — Un fallo del observador no pierde la respuesta', async () => {
      const { procesar, observadoresAviso, salida, transicionar, orden } = armar({
        pasos: [PASO],
        aviso: { motivo: 'audio-repetido' },
      });
      observadoresAviso.registrar({ alAvisarAsesor: () => Promise.reject(new Error('Telegram caído')) });

      await expect(procesar.ejecutar('conv-1', 'job-1')).resolves.toEqual({ reencolar: false });

      expect(salida.llamadas).toHaveLength(1);
      expect(orden[0]).toBe('enviar');
      expect(transicionar.llamadas).toHaveLength(0);
    });

    it('CNV11 — Petición de persona avisa y la conversación sigue en bot', async () => {
      const { procesar, transicionar, salida, eventos } = armar({ pasos: [PASO], aviso: { motivo: 'pide-persona' } });

      await procesar.ejecutar('conv-1', 'job-1');

      expect(salida.llamadas[0].pasos).toEqual([PASO]);
      expect(eventos.map((e) => e.motivo)).toEqual(['pide-persona']);
      expect(transicionar.llamadas).toHaveLength(0);
    });

    it('CNV11 — Lead caliente agrega su etiqueta sin traspasar', async () => {
      const { procesar, transicionar, canal } = armar({ pasos: [PASO], aviso: { motivo: 'lead-caliente' } });

      await procesar.ejecutar('conv-1', 'job-1');

      expect(transicionar.llamadas).toHaveLength(0);
      expect(canal.etiquetas).toEqual([
        { idConversacion: '42', idOperacion: 'etiqueta-lead-v0', etiquetas: ['lead-caliente'] },
      ]);
    });

    it('CNV11 — Un aviso que no es de lead no agrega la etiqueta', async () => {
      const { procesar, canal } = armar({ pasos: [PASO], aviso: { motivo: 'pide-persona' } });

      await procesar.ejecutar('conv-1', 'job-1');

      expect(canal.etiquetas).toEqual([]);
    });

    it('CNV11 — El aviso se encola después de los pasos de la respuesta', async () => {
      const { procesar, orden } = armar({ pasos: [PASO], aviso: { motivo: 'audio-repetido' } });

      await procesar.ejecutar('conv-1', 'job-1');

      expect(orden).toEqual(['enviar', 'avisar']);
    });

    it('CNV11 — Una respuesta con aviso y handoff ejecuta solo el handoff', async () => {
      const { procesar, transicionar, eventos, marca } = armar({
        pasos: [PASO],
        aviso: { motivo: 'pide-persona' },
        handoff: { motivo: 'fallo-llm' },
      });

      await procesar.ejecutar('conv-1', 'job-1');

      expect(transicionar.llamadas.map((l) => l.destino)).toEqual(['handoff_pendiente']);
      expect(eventos).toEqual([]); // ningún observador de aviso; el traspaso lo avisa `AvisoTraspaso`
      expect(marca.puestas.size).toBe(0);
    });

    it('CNV8 — Una falla del modelo sigue llevando a handoff pendiente', async () => {
      const { procesar, transicionar, salida } = armar({ pasos: [PASO], handoff: { motivo: 'fallo-llm' } });

      await procesar.ejecutar('conv-1', 'job-1');

      expect(salida.llamadas[0].conHandoff).toBe(true);
      expect(transicionar.llamadas.map((l) => [l.destino, l.origen])).toEqual([
        ['handoff_pendiente', 'regla_handoff_explicita'],
      ]);
    });

    it('CNV14 — Dos avisos del mismo motivo notifican una sola vez', async () => {
      let n = 0;
      const { procesar, buffer, eventos, salida } = armar(() => ({
        pasos: [PASO],
        aviso: { motivo: n++ === 0 ? 'pide-persona' : 'pide-asesor' },
      }));

      await procesar.ejecutar('conv-1', 'job-1');
      await buffer.push('conv-1', mensaje('otra vez'));
      await procesar.ejecutar('conv-1', 'job-2');

      expect(eventos.map((e) => e.motivo)).toEqual(['pide-persona']);
      expect(salida.llamadas).toHaveLength(2); // la respuesta del turno se envía igual
    });

    it('CNV14 — Un motivo distinto avisa aunque ya haya otro aviso', async () => {
      let n = 0;
      const { procesar, buffer, eventos } = armar(() => ({
        pasos: [PASO],
        aviso: { motivo: n++ === 0 ? 'pide-asesor' : 'lead-caliente' },
      }));

      await procesar.ejecutar('conv-1', 'job-1');
      await buffer.push('conv-1', mensaje('quiero pagar'));
      await procesar.ejecutar('conv-1', 'job-2');

      expect(eventos.map((e) => e.motivo)).toEqual(['pide-asesor', 'lead-caliente']);
    });

    it('CNV14 — Dos turnos simultáneos con el mismo motivo avisan una sola vez', async () => {
      const { crear, eventos } = armar({ pasos: [PASO], aviso: { motivo: 'pide-persona' } });
      const otroBuffer = new BufferTurnoFalso([mensaje('hola otra vez')]);

      await Promise.all([crear().ejecutar('conv-1', 'job-1'), crear(otroBuffer).ejecutar('conv-1', 'job-2')]);

      expect(eventos).toHaveLength(1);
    });

    it('CNV14 — Un observador que falla libera la marca', async () => {
      const { procesar, buffer, observadoresAviso, eventos, marca } = armar({
        pasos: [PASO],
        aviso: { motivo: 'audio-repetido' },
      });
      let falla = true;
      observadoresAviso.registrar({
        alAvisarAsesor: () => (falla ? Promise.reject(new Error('Telegram caído')) : Promise.resolve()),
      });

      await procesar.ejecutar('conv-1', 'job-1');
      expect(marca.puestas.size).toBe(0);

      falla = false;
      await buffer.push('conv-1', mensaje('otro audio'));
      await procesar.ejecutar('conv-1', 'job-2');

      expect(eventos).toHaveLength(2); // el segundo turno volvió a notificar
      expect(marca.puestas.size).toBe(1);
    });

    it('CNV14 — Sin Redis se avisa igual', async () => {
      const { procesar, marca, eventos, salida } = armar({ pasos: [PASO], aviso: { motivo: 'pide-asesor' } });
      const advertencia = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      marca.fallar = true;

      await procesar.ejecutar('conv-1', 'job-1');

      expect(eventos).toHaveLength(1);
      expect(salida.llamadas).toHaveLength(1);
      expect(advertencia).toHaveBeenCalledWith({
        evento: 'conversaciones.asesor-avisado-marca-fallo',
        error: 'Error',
      });
    });

    it('CNV14 — La marca de aviso no guarda el contenido', async () => {
      const { procesar, marca } = armar({ pasos: [PASO], aviso: { motivo: 'pide-asesor' } });

      await procesar.ejecutar('conv-1', 'job-1');

      expect([...marca.puestas]).toEqual(['conv-1:pide-persona']);
    });

    it('CNV11 — Una etiqueta que falla no pierde el aviso ni la respuesta', async () => {
      const { procesar, canal, eventos, salida } = armar({ pasos: [PASO], aviso: { motivo: 'lead-caliente' } });
      canal.fallaEtiqueta = true;

      await procesar.ejecutar('conv-1', 'job-1');

      expect(eventos).toHaveLength(1);
      expect(salida.llamadas).toHaveLength(1);
    });
  });
});
