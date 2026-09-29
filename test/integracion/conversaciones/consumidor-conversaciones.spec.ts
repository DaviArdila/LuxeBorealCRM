import { BullModule } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgenteEco } from '../../../src/modulos/conversaciones/aplicacion/agente-eco.js';
import { ConsumidorConversaciones } from '../../../src/modulos/conversaciones/aplicacion/consumidor-conversaciones.js';
import { ProcesarTurno } from '../../../src/modulos/conversaciones/aplicacion/procesar-turno.js';
import { TransicionarConversacion } from '../../../src/modulos/conversaciones/aplicacion/transicionar-conversacion.js';
import { ColaTurno, NOMBRE_COLA_TURNO } from '../../../src/modulos/conversaciones/infraestructura/colas/cola-turno.js';
import { BufferTurno } from '../../../src/modulos/conversaciones/infraestructura/redis/buffer-turno.js';
import { ContadorRateLimit } from '../../../src/modulos/conversaciones/infraestructura/redis/contador-rate-limit.js';
import {
  CLAVE_INTERRUPTOR_GLOBAL_CONFIGURADA,
  InterruptorGlobalRedis,
} from '../../../src/modulos/conversaciones/infraestructura/redis/interruptor-global-redis.js';
import { LockTurno } from '../../../src/modulos/conversaciones/infraestructura/redis/lock-turno.js';
import { MarcaEsperaHandoff } from '../../../src/modulos/conversaciones/infraestructura/redis/marca-espera-handoff.js';
import { MarcaMensajeProcesado } from '../../../src/modulos/conversaciones/infraestructura/redis/marca-mensaje-procesado.js';
import { RepositorioConversacionPrisma } from '../../../src/modulos/conversaciones/infraestructura/prisma/repositorio-conversacion-prisma.js';
import { RepositorioParametroConversacionesPrisma } from '../../../src/modulos/conversaciones/infraestructura/prisma/repositorio-parametro-conversaciones-prisma.js';
import {
  GENERADOR_RESPUESTA,
  type GeneradorRespuesta,
  type RespuestaTurno,
  type SolicitudTurno,
} from '../../../src/modulos/conversaciones/puertos/generador-respuesta.js';
import { INTERRUPTOR_GLOBAL } from '../../../src/modulos/conversaciones/puertos/interruptor-global.js';
import { REPOSITORIO_PARAMETRO_CONVERSACIONES } from '../../../src/modulos/conversaciones/puertos/repositorio-parametro-conversaciones.js';
import { REPOSITORIO_CONVERSACION } from '../../../src/modulos/conversaciones/puertos/repositorio-conversacion.js';
import {
  ENVIAR_RESPUESTA_TURNO,
  type EnviarRespuestaTurno,
  type PasoRespuesta,
} from '../../../src/modulos/conversaciones/puertos/salida-conversacion.js';
import {
  LECTOR_MENSAJE_CANAL,
  SALIDA_CANAL,
  type EventoCanal,
  type LectorMensajeCanal,
  type SalidaCanal,
  type SolicitudCambioEstado,
  type SolicitudEnvioMensajes,
} from '../../../src/modulos/canales/index.js';
import { ColasModule } from '../../../src/plataforma/colas/index.js';
import { CONFIGURACION, ConfiguracionModule, type Configuracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { REDIS_CLIENTE, RedisModule, type ClienteRedis } from '../../../src/plataforma/redis/index.js';
import { RelojModule } from '../../../src/plataforma/reloj/index.js';
import {
  claveInterruptorDePrueba,
  prefijoRedisDePrueba,
  urlPostgresDePrueba,
  urlRedisDePrueba,
} from '../../soporte/infraestructura.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';

class EnviarRespuestaTurnoDoble implements EnviarRespuestaTurno {
  llamadas: { idConversacion: string; idRespuesta: string; pasos: readonly PasoRespuesta[] }[] = [];

  enviar(idConversacion: string, idRespuesta: string, pasos: readonly PasoRespuesta[]): Promise<void> {
    this.llamadas.push({ idConversacion, idRespuesta, pasos });
    return Promise.resolve();
  }
}

/** Eco trivial: devuelve el propio `idMensaje` como texto (esta suite no depende de Chatwoot real). */
class LectorMensajeCanalDoble implements LectorMensajeCanal {
  /** Ids de mensaje leídos: CNV7 exige que un mensaje no textual no llegue a leerse. */
  lecturas: string[] = [];

  obtenerTexto(_idConversacion: string, idMensaje: string): Promise<string | null> {
    this.lecturas.push(idMensaje);
    return Promise.resolve(`texto-${idMensaje}`);
  }
}

/** Generador que registra cada solicitud del turno y no responde nada (CNV8: sin pasos). */
class GeneradorRegistrador implements GeneradorRespuesta {
  solicitudes: SolicitudTurno[] = [];

  generar(solicitud: SolicitudTurno): Promise<RespuestaTurno> {
    this.solicitudes.push(solicitud);
    return Promise.resolve({ pasos: [] });
  }
}

/**
 * Judgment-day ronda 2: subclase de `BufferTurno` que lanza en su primer `push` (simula un fallo
 * transitorio de Redis a mitad de turno) y funciona con normalidad desde el segundo intento en
 * adelante. Prueba que la marca de idempotencia ya no se escribe antes de que el trabajo protegido
 * termine con éxito: si se escribiera antes (como en `ddb72d2`), una reentrega tras este fallo
 * encontraría la marca puesta y descartaría el mensaje en silencio para siempre.
 */
class BufferTurnoFallaUnaVez extends BufferTurno {
  intentos = 0;

  override async push(idConversacion: string, valor: string): Promise<void> {
    this.intentos += 1;
    if (this.intentos === 1) {
      throw new Error('fallo simulado de Redis (judgment-day ronda 2)');
    }
    await super.push(idConversacion, valor);
  }
}

/** Doble de `SALIDA_CANAL` (T8): registra las llamadas del aviso único de espera (CNV3). */
class SalidaCanalDoble implements SalidaCanal {
  llamadas: SolicitudEnvioMensajes[] = [];
  estados: SolicitudCambioEstado[] = [];

  enviarMensajes(solicitud: SolicitudEnvioMensajes): Promise<void> {
    this.llamadas.push(solicitud);
    return Promise.resolve();
  }

  cambiarEstado(solicitud: SolicitudCambioEstado): Promise<void> {
    this.estados.push(solicitud);
    return Promise.resolve();
  }

  agregarEtiquetas(): Promise<void> {
    return Promise.resolve();
  }
}

async function crearAplicacion(
  configuracionParcial: Partial<Configuracion> = {},
  claseBufferTurno: typeof BufferTurno = BufferTurno,
  generador?: GeneradorRespuesta,
): Promise<{
  app: INestApplication;
  salida: EnviarRespuestaTurnoDoble;
  salidaCanal: SalidaCanalDoble;
  lector: LectorMensajeCanalDoble;
}> {
  const configuracionDePrueba: Configuracion = {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'silent',
    DATABASE_URL: urlPostgresDePrueba(),
    REDIS_URL: urlRedisDePrueba(),
    HEALTH_TIMEOUT_MS: 1500,
    DOCS_HABILITADO: false,
    MINIO_ENDPOINT: 'localhost',
    MINIO_PUERTO: 9000,
    MINIO_SSL: false,
    MINIO_ACCESS_KEY: 'luxe',
    MINIO_SECRET_KEY: 'luxeclave',
    MINIO_BUCKET: 'luxeboreal-medios',
    MINIO_URL_PUBLICA: undefined,
    CATALOGO_SHEET_ID: undefined,
    CHATWOOT_URL: 'http://localhost:3001',
    CHATWOOT_ACCOUNT_ID: 1,
    CHATWOOT_BOT_TOKEN: '',
    CHATWOOT_WEBHOOK_SECRETO: '',
    CHATWOOT_WEBHOOK_TOLERANCIA_S: 300,
    CHATWOOT_HTTP_TIMEOUT_MS: 10000,
    COLAS_PREFIJO: `${prefijoRedisDePrueba()}colas`,
    COLAS_TRABAJADORES: true,
    INBOX_MAX_INTENTOS: 5,
    INBOX_BARRIDO_MS: 30000,
    OUTBOX_MAX_INTENTOS: 5,
    OUTBOX_BACKOFF_BASE_S: 15,
    OUTBOX_BACKOFF_MAX_S: 300,
    OUTBOX_BARRIDO_MS: 5000,
    OUTBOX_LEASE_S: 60,
    HUMANO_TTL_HORAS: 3,
    HANDOFF_TTL_MIN: 45,
    LOCK_TURNO_TTL_S: 30,
    RATE_LIMIT_POR_HORA: 20,
    RATE_LIMIT_POR_DIA: 60,
    DEBOUNCE_MS: 500,
    CONVERSACIONES_CONCURRENCIA: 10,
    CONVERSACIONES_BARRIDO_MS: 300000,
    HANDOFF_ESPERA_MIN: 30,
    ...CONFIGURACION_AGENTE_DE_PRUEBA,
    ...CONFIGURACION_LLM_DE_PRUEBA,
    ...configuracionParcial,
  };

  const salida = new EnviarRespuestaTurnoDoble();
  const salidaCanal = new SalidaCanalDoble();
  const lector = new LectorMensajeCanalDoble();

  let constructorModulo = Test.createTestingModule({
    imports: [
      ConfiguracionModule,
      RelojModule,
      PrismaModule,
      RedisModule,
      ColasModule,
      BullModule.registerQueue({ name: NOMBRE_COLA_TURNO }),
    ],
    providers: [
      { provide: REPOSITORIO_CONVERSACION, useClass: RepositorioConversacionPrisma },
      { provide: REPOSITORIO_PARAMETRO_CONVERSACIONES, useClass: RepositorioParametroConversacionesPrisma },
      { provide: CLAVE_INTERRUPTOR_GLOBAL_CONFIGURADA, useValue: claveInterruptorDePrueba() },
      { provide: INTERRUPTOR_GLOBAL, useClass: InterruptorGlobalRedis },
      { provide: LECTOR_MENSAJE_CANAL, useValue: lector },
      { provide: SALIDA_CANAL, useValue: salidaCanal },
      generador === undefined
        ? { provide: GENERADOR_RESPUESTA, useClass: AgenteEco }
        : { provide: GENERADOR_RESPUESTA, useValue: generador },
      { provide: ENVIAR_RESPUESTA_TURNO, useValue: salida },
      BufferTurno,
      LockTurno,
      ContadorRateLimit,
      MarcaEsperaHandoff,
      MarcaMensajeProcesado,
      ColaTurno,
      ProcesarTurno,
      TransicionarConversacion,
      ConsumidorConversaciones,
    ],
  })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba);
  if (claseBufferTurno !== BufferTurno) {
    constructorModulo = constructorModulo.overrideProvider(BufferTurno).useClass(claseBufferTurno);
  }
  const modulo = await constructorModulo.compile();

  const app = modulo.createNestApplication();
  await app.init();
  return { app, salida, salidaCanal, lector };
}

async function crearConversacion(
  prisma: PrismaService,
  estado: 'bot' | 'humano' | 'handoff_pendiente' = 'bot',
): Promise<{ id: string; chatwootConversationId: number }> {
  const contacto = await prisma.contacto.create({ data: {} });
  const chatwootConversationId = Math.floor(Math.random() * 1_000_000_000);
  const conversacion = await prisma.conversacion.create({
    data: { contactoId: contacto.id, chatwootConversationId, canal: 'whatsapp', estado },
  });
  return { id: conversacion.id, chatwootConversationId };
}

/**
 * `idMensaje` es el id de mensaje de Chatwoot: único en toda la instancia, no solo dentro de una
 * conversación (`traducir-evento.ts`, `ev.id`). Se compone con `chatwootConversationId` (aleatorio
 * por test) para que los sufijos cortos y repetidos entre tests (`'m1'`, `'m2'`...) no colisionen en
 * la marca de idempotencia de Redis, compartida entre los `it()` de este archivo.
 */
function eventoMensajeEntrante(
  chatwootConversationId: number,
  sufijoIdMensaje: string,
  tipoContenido: Extract<EventoCanal, { tipo: 'mensaje-entrante' }>['tipoContenido'] = 'texto',
): EventoCanal {
  return {
    v: 1,
    eventoProveedor: 'message_created',
    conversacion: {
      idExterno: String(chatwootConversationId),
      idContactoExterno: null,
      canal: 'whatsapp',
      canalProveedor: 'Channel::Whatsapp',
    },
    tipo: 'mensaje-entrante',
    idMensaje: `${chatwootConversationId}-${sufijoIdMensaje}`,
    tipoContenido,
  };
}

function eventoMensajeHumano(chatwootConversationId: number, sufijoIdMensaje: string): EventoCanal {
  return {
    v: 1,
    eventoProveedor: 'message_created',
    conversacion: {
      idExterno: String(chatwootConversationId),
      idContactoExterno: null,
      canal: 'whatsapp',
      canalProveedor: 'Channel::Whatsapp',
    },
    tipo: 'mensaje-humano',
    idMensaje: `${chatwootConversationId}-${sufijoIdMensaje}`,
  };
}

function eventoCambioEstado(
  chatwootConversationId: number,
  estado: 'abierta' | 'pendiente' | 'resuelta',
): EventoCanal {
  return {
    v: 1,
    eventoProveedor: 'conversation_status_changed',
    conversacion: {
      idExterno: String(chatwootConversationId),
      idContactoExterno: null,
      canal: 'whatsapp',
      canalProveedor: 'Channel::Whatsapp',
    },
    tipo: 'estado-conversacion',
    estado,
  };
}

describe('ConsumidorConversaciones (T5, integración, D5/CNV2/CNV4/CNV5/R8/R13)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('CNV2 — Tres mensajes entrantes en estado humano no generan ninguna respuesta', async () => {
    const contexto = await crearAplicacion();
    app = contexto.app;
    const prisma = app.get(PrismaService);
    const consumidor = app.get(ConsumidorConversaciones);
    const { chatwootConversationId } = await crearConversacion(prisma, 'humano');

    await consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, 'm1'));
    await consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, 'm2'));
    await consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, 'm3'));
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(contexto.salida.llamadas).toHaveLength(0);
  });

  it('CNV7 — Un audio llega al generador con su tipo y sin leer texto de Chatwoot', async () => {
    const generador = new GeneradorRegistrador();
    const contexto = await crearAplicacion({}, BufferTurno, generador);
    app = contexto.app;
    const prisma = app.get(PrismaService);
    const consumidor = app.get(ConsumidorConversaciones);
    const { chatwootConversationId } = await crearConversacion(prisma, 'bot');

    await consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, 'audio-1', 'audio'));

    await vi.waitFor(
      () => {
        expect(generador.solicitudes).toHaveLength(1);
      },
      { timeout: 10_000, interval: 100 },
    );
    expect(generador.solicitudes[0].mensajes).toEqual([
      { idMensaje: `${chatwootConversationId}-audio-1`, tipoContenido: 'audio', texto: '' },
    ]);
    expect(contexto.lector.lecturas).toHaveLength(0);
    expect(contexto.salida.llamadas).toHaveLength(0); // CNV8: sin pasos, nada sale
  });

  it('un mensaje de texto sí se lee de Chatwoot y viaja con su tipo', async () => {
    const generador = new GeneradorRegistrador();
    const contexto = await crearAplicacion({}, BufferTurno, generador);
    app = contexto.app;
    const prisma = app.get(PrismaService);
    const consumidor = app.get(ConsumidorConversaciones);
    const { chatwootConversationId } = await crearConversacion(prisma, 'bot');

    await consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, 'texto-1'));

    await vi.waitFor(
      () => {
        expect(generador.solicitudes).toHaveLength(1);
      },
      { timeout: 10_000, interval: 100 },
    );
    const idMensaje = `${chatwootConversationId}-texto-1`;
    expect(generador.solicitudes[0].mensajes).toEqual([
      { idMensaje, tipoContenido: 'texto', texto: `texto-${idMensaje}` },
    ]);
    expect(contexto.lector.lecturas).toEqual([idMensaje]);
  });

  it('CNV4 — Con el interruptor apagado, el mensaje se registra sin generar respuesta', async () => {
    const contexto = await crearAplicacion();
    app = contexto.app;
    const prisma = app.get(PrismaService);
    const redis = app.get<ClienteRedis>(REDIS_CLIENTE);
    if (redis.status !== 'ready') await redis.connect();
    await redis.set(claveInterruptorDePrueba(), 'false');
    const consumidor = app.get(ConsumidorConversaciones);
    const { id, chatwootConversationId } = await crearConversacion(prisma, 'bot');

    await consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, 'm1'));
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(contexto.salida.llamadas).toHaveLength(0);
    const fila = await prisma.conversacion.findUniqueOrThrow({ where: { id } });
    expect(fila.estado).toBe('bot'); // sigue existiendo/registrada, solo no generó respuesta

    await redis.del(claveInterruptorDePrueba());
  });

  it('CNV5 — Un evento de estado "pending" sobre una conversación en manos humanas la devuelve al bot', async () => {
    const contexto = await crearAplicacion();
    app = contexto.app;
    const prisma = app.get(PrismaService);
    const consumidor = app.get(ConsumidorConversaciones);
    const { id, chatwootConversationId } = await crearConversacion(prisma, 'humano');

    await consumidor.consumir(eventoCambioEstado(chatwootConversationId, 'pendiente'));

    const fila = await prisma.conversacion.findUniqueOrThrow({ where: { id } });
    expect(fila.estado).toBe('bot');
  });

  it('CNV5 — Un evento de estado "open" sobre una conversación en bot equivale a un eco humano', async () => {
    const contexto = await crearAplicacion();
    app = contexto.app;
    const prisma = app.get(PrismaService);
    const consumidor = app.get(ConsumidorConversaciones);
    const { id, chatwootConversationId } = await crearConversacion(prisma, 'bot');

    await consumidor.consumir(eventoCambioEstado(chatwootConversationId, 'abierta'));

    const fila = await prisma.conversacion.findUniqueOrThrow({ where: { id } });
    expect(fila.estado).toBe('humano');
  });

  it('CNV8 — Una vuelta al bot que vino del canal no se espeja', async () => {
    const contexto = await crearAplicacion();
    app = contexto.app;
    const prisma = app.get(PrismaService);
    const consumidor = app.get(ConsumidorConversaciones);
    const { id, chatwootConversationId } = await crearConversacion(prisma, 'humano');

    await consumidor.consumir(eventoCambioEstado(chatwootConversationId, 'resuelta'));

    const fila = await prisma.conversacion.findUniqueOrThrow({ where: { id } });
    expect(fila.estado).toBe('bot');
    expect(contexto.salidaCanal.estados).toEqual([]);
  });

  it('CNV8 — Un eco humano sobre una conversación en bot se espeja como abierta', async () => {
    const contexto = await crearAplicacion();
    app = contexto.app;
    const prisma = app.get(PrismaService);
    const consumidor = app.get(ConsumidorConversaciones);
    const { id, chatwootConversationId } = await crearConversacion(prisma, 'bot');

    await consumidor.consumir(eventoMensajeHumano(chatwootConversationId, 'eco-1'));

    expect(contexto.salidaCanal.estados).toEqual([{ idConversacion: id, idOperacion: 'espejo-v1', estado: 'abierta' }]);
  });

  it('CNV8 — El eco del espejo abierta no vuelve a transicionar', async () => {
    const contexto = await crearAplicacion();
    app = contexto.app;
    const prisma = app.get(PrismaService);
    const consumidor = app.get(ConsumidorConversaciones);
    const { id, chatwootConversationId } = await crearConversacion(prisma, 'handoff_pendiente');

    await consumidor.consumir(eventoCambioEstado(chatwootConversationId, 'abierta'));

    const fila = await prisma.conversacion.findUniqueOrThrow({ where: { id } });
    expect(fila.estado).toBe('handoff_pendiente');
    expect(fila.version).toBe(0); // ninguna transición nueva
    expect(contexto.salidaCanal.estados).toEqual([]);
  });

  it('R13 — Se supera el límite de mensajes por hora', async () => {
    const contexto = await crearAplicacion({ RATE_LIMIT_POR_HORA: 3, RATE_LIMIT_POR_DIA: 100 });
    app = contexto.app;
    const prisma = app.get(PrismaService);
    const consumidor = app.get(ConsumidorConversaciones);
    const { chatwootConversationId } = await crearConversacion(prisma, 'bot');

    for (let i = 0; i < 3; i += 1) {
      await consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, `m${i}`));
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    const llamadasAntes = contexto.salida.llamadas.length;

    await consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, 'm-extra'));
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(contexto.salida.llamadas.length).toBe(llamadasAntes); // el 4º mensaje no generó respuesta nueva
  });

  it('R13 — Se supera el límite de mensajes por día', async () => {
    const contexto = await crearAplicacion({ RATE_LIMIT_POR_HORA: 100, RATE_LIMIT_POR_DIA: 2 });
    app = contexto.app;
    const prisma = app.get(PrismaService);
    const consumidor = app.get(ConsumidorConversaciones);
    const { chatwootConversationId } = await crearConversacion(prisma, 'bot');

    await consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, 'm1'));
    await consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, 'm2'));
    await new Promise((resolve) => setTimeout(resolve, 800));
    const llamadasAntes = contexto.salida.llamadas.length;

    await consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, 'm3'));
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(contexto.salida.llamadas.length).toBe(llamadasAntes);
  });

  it('R8 — Eco humano durante la ventana de debounce cancela el job', async () => {
    const contexto = await crearAplicacion({ DEBOUNCE_MS: 1500 });
    app = contexto.app;
    const prisma = app.get(PrismaService);
    const buffer = app.get(BufferTurno);
    const consumidor = app.get(ConsumidorConversaciones);
    const { id, chatwootConversationId } = await crearConversacion(prisma, 'bot');

    await consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, 'm1'));
    expect(await buffer.tamano(id)).toBe(1);

    await consumidor.consumir(eventoMensajeHumano(chatwootConversationId, 'eco-1'));

    expect(await buffer.tamano(id)).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 2000)); // más allá de la ventana de debounce
    expect(contexto.salida.llamadas).toHaveLength(0);

    const fila = await prisma.conversacion.findUniqueOrThrow({ where: { id } });
    expect(fila.estado).toBe('humano');
  });

  it('judgment-day — la reentrega del mismo idMensaje es un no-op idempotente (rate limit y buffer)', async () => {
    const contexto = await crearAplicacion({ RATE_LIMIT_POR_HORA: 2, RATE_LIMIT_POR_DIA: 100 });
    app = contexto.app;
    const prisma = app.get(PrismaService);
    const buffer = app.get(BufferTurno);
    const consumidor = app.get(ConsumidorConversaciones);
    const { id, chatwootConversationId } = await crearConversacion(prisma, 'bot');

    // Misma entrega repetida dos veces (simula la redelivery al-menos-una-vez del inbox de
    // canales): el rate limit configurado a 2/hora solo debe contar la primera.
    await consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, 'm1'));
    expect(await buffer.tamano(id)).toBe(1);

    await consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, 'm1'));
    expect(await buffer.tamano(id)).toBe(1); // no se volvió a apilar

    // Un mensaje nuevo (idMensaje distinto) todavía cabe dentro del cupo de 2/hora: prueba de que la
    // reentrega de 'm1' no lo consumió dos veces (si lo hubiera hecho, el cupo ya estaría agotado y
    // este mensaje se descartaría por R13 sin apilarse).
    await consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, 'm2'));

    expect(await buffer.tamano(id)).toBe(2);
  });

  it('judgment-day ronda 2 — un fallo transitorio en el trabajo protegido no pierde el mensaje en la reentrega', async () => {
    const contexto = await crearAplicacion({}, BufferTurnoFallaUnaVez);
    app = contexto.app;
    const prisma = app.get(PrismaService);
    const buffer = app.get<BufferTurno, BufferTurnoFallaUnaVez>(BufferTurno);
    const consumidor = app.get(ConsumidorConversaciones);
    const { id, chatwootConversationId } = await crearConversacion(prisma, 'bot');

    // Primer intento: el push al buffer lanza (fallo simulado de Redis a mitad de turno). Si la
    // marca de idempotencia se hubiera escrito ANTES de este trabajo (como en `ddb72d2`), la
    // reentrega de abajo se descartaría en silencio y el mensaje se perdería para siempre.
    await expect(consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, 'm1'))).rejects.toThrow();
    expect(await buffer.tamano(id)).toBe(0); // el fallo ocurrió antes de que el push tuviera éxito

    // Reentrega del mismo idMensaje (redelivery del inbox tras el fallo transitorio): el segundo
    // intento de push ya no lanza, así que el mensaje SÍ debe llegar al buffer esta vez.
    await consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, 'm1'));

    expect(await buffer.tamano(id)).toBe(1);
    expect(buffer.intentos).toBe(2);
  });
});
