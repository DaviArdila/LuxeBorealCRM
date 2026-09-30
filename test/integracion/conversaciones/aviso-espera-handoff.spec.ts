import { BullModule } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { AgenteEco } from '../../../src/modulos/conversaciones/aplicacion/agente-eco.js';
import { ConsumidorConversaciones } from '../../../src/modulos/conversaciones/aplicacion/consumidor-conversaciones.js';
import { ProcesarTurno } from '../../../src/modulos/conversaciones/aplicacion/procesar-turno.js';
import { TransicionarConversacion } from '../../../src/modulos/conversaciones/aplicacion/transicionar-conversacion.js';
import { ColaTurno, NOMBRE_COLA_TURNO } from '../../../src/modulos/conversaciones/infraestructura/colas/cola-turno.js';
import { MarcaEsperaHandoff } from '../../../src/modulos/conversaciones/infraestructura/redis/marca-espera-handoff.js';
import { MarcaMensajeProcesado } from '../../../src/modulos/conversaciones/infraestructura/redis/marca-mensaje-procesado.js';
import { BufferTurno } from '../../../src/modulos/conversaciones/infraestructura/redis/buffer-turno.js';
import { ContadorRateLimit } from '../../../src/modulos/conversaciones/infraestructura/redis/contador-rate-limit.js';
import { InterruptorGlobalRedis } from '../../../src/modulos/conversaciones/infraestructura/redis/interruptor-global-redis.js';
import { LockTurno } from '../../../src/modulos/conversaciones/infraestructura/redis/lock-turno.js';
import { RepositorioConversacionPrisma } from '../../../src/modulos/conversaciones/infraestructura/prisma/repositorio-conversacion-prisma.js';
import { RepositorioParametroConversacionesPrisma } from '../../../src/modulos/conversaciones/infraestructura/prisma/repositorio-parametro-conversaciones-prisma.js';
import { GENERADOR_RESPUESTA } from '../../../src/modulos/conversaciones/puertos/generador-respuesta.js';
import { INTERRUPTOR_GLOBAL } from '../../../src/modulos/conversaciones/puertos/interruptor-global.js';
import { REPOSITORIO_PARAMETRO_CONVERSACIONES } from '../../../src/modulos/conversaciones/puertos/repositorio-parametro-conversaciones.js';
import { REPOSITORIO_CONVERSACION } from '../../../src/modulos/conversaciones/puertos/repositorio-conversacion.js';
import { ENVIAR_RESPUESTA_TURNO, type EnviarRespuestaTurno } from '../../../src/modulos/conversaciones/puertos/salida-conversacion.js';
import {
  LECTOR_MENSAJE_CANAL,
  SALIDA_CANAL,
  type EventoCanal,
  type LectorMensajeCanal,
  type SalidaCanal,
  type SolicitudEnvioMensajes,
} from '../../../src/modulos/canales/index.js';
import { ColasModule } from '../../../src/plataforma/colas/index.js';
import { CONFIGURACION, ConfiguracionModule, type Configuracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { RedisModule } from '../../../src/plataforma/redis/index.js';
import { CLOCK, RelojModule } from '../../../src/plataforma/reloj/index.js';
import { ClockFalso } from '../../fakes/clock-falso.js';
import { prefijoRedisDePrueba, urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';

class SalidaCanalDoble implements SalidaCanal {
  llamadas: SolicitudEnvioMensajes[] = [];

  enviarMensajes(solicitud: SolicitudEnvioMensajes): Promise<void> {
    this.llamadas.push(solicitud);
    return Promise.resolve();
  }

  cambiarEstado(): Promise<void> {
    return Promise.resolve();
  }

  agregarEtiquetas(): Promise<void> {
    return Promise.resolve();
  }
}

class EnviarRespuestaTurnoDoble implements EnviarRespuestaTurno {
  enviar(): Promise<void> {
    return Promise.resolve();
  }
}

class LectorMensajeCanalDoble implements LectorMensajeCanal {
  obtenerTexto(): Promise<string | null> {
    return Promise.resolve('texto');
  }
}

async function crearAplicacion(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
  consumidor: ConsumidorConversaciones;
  salidaCanal: SalidaCanalDoble;
  clock: ClockFalso;
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
    COLAS_TRABAJADORES: false,
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
  };

  const salidaCanal = new SalidaCanalDoble();
  const clock = new ClockFalso(new Date('2026-09-28T12:00:00Z'));

  const modulo = await Test.createTestingModule({
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
      { provide: INTERRUPTOR_GLOBAL, useClass: InterruptorGlobalRedis },
      { provide: LECTOR_MENSAJE_CANAL, useClass: LectorMensajeCanalDoble },
      { provide: SALIDA_CANAL, useValue: salidaCanal },
      { provide: GENERADOR_RESPUESTA, useClass: AgenteEco },
      { provide: ENVIAR_RESPUESTA_TURNO, useClass: EnviarRespuestaTurnoDoble },
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
    .useValue(configuracionDePrueba)
    .overrideProvider(CLOCK)
    .useValue(clock)
    .compile();

  const app = modulo.createNestApplication();
  await app.init();

  return {
    app,
    prisma: app.get(PrismaService),
    consumidor: app.get(ConsumidorConversaciones),
    salidaCanal,
    clock,
  };
}

async function crearConversacionHandoffPendiente(prisma: PrismaService, expiraControlEn: Date): Promise<number> {
  const contacto = await prisma.contacto.create({ data: {} });
  const chatwootConversationId = Math.floor(Math.random() * 1_000_000_000);
  await prisma.conversacion.create({
    data: {
      contactoId: contacto.id,
      chatwootConversationId,
      canal: 'whatsapp',
      estado: 'handoff_pendiente',
      expiraControlEn,
    },
  });
  return chatwootConversationId;
}

function eventoMensajeEntrante(chatwootConversationId: number, idMensaje: string): EventoCanal {
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
    idMensaje,
    tipoContenido: 'texto',
  };
}

describe('Aviso único de espera en handoff_pendiente (T8, integración, CNV3, D12)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('CNV3 — El primer mensaje del cliente tras la espera recibe un único aviso', async () => {
    const contexto = await crearAplicacion();
    app = contexto.app;
    // HANDOFF_TTL_MIN=45, HANDOFF_ESPERA_MIN=30 ⇒ entradaMasEspera = expiraControlEn - 15min.
    // expiraControlEn = 12:10 ⇒ entradaMasEspera = 11:55, ya pasó respecto a "ahora" = 12:00.
    const chatwootConversationId = await crearConversacionHandoffPendiente(
      contexto.prisma,
      new Date('2026-09-28T12:10:00Z'),
    );

    await contexto.consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, `${chatwootConversationId}-m1`));

    expect(contexto.salidaCanal.llamadas).toHaveLength(1);
    expect(contexto.salidaCanal.llamadas[0].mensajes).toHaveLength(1);
    const mensaje = contexto.salidaCanal.llamadas[0].mensajes[0];
    expect(mensaje.tipo).toBe('texto');
    expect(mensaje.tipo === 'texto' && mensaje.texto.length).toBeGreaterThan(0);
    expect(contexto.salidaCanal.llamadas[0].requiereEstado).toBe('handoff_pendiente'); // CNV9
    // El outbox real (`claveMensaje`) rechaza un idRespuesta con ':' o de más de 64 caracteres.
    expect(contexto.salidaCanal.llamadas[0].idRespuesta).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it('CNV3 — Un segundo mensaje del cliente no repite el aviso', async () => {
    const contexto = await crearAplicacion();
    app = contexto.app;
    const chatwootConversationId = await crearConversacionHandoffPendiente(
      contexto.prisma,
      new Date('2026-09-28T12:10:00Z'),
    );

    await contexto.consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, `${chatwootConversationId}-m1`));
    await contexto.consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, `${chatwootConversationId}-m2`));

    expect(contexto.salidaCanal.llamadas).toHaveLength(1);
  });

  it('antes de HANDOFF_ESPERA_MIN, no envía ningún aviso', async () => {
    const contexto = await crearAplicacion();
    app = contexto.app;
    // expiraControlEn = 12:40 ⇒ entradaMasEspera = 12:25, todavía no pasó respecto a "ahora" = 12:00.
    const chatwootConversationId = await crearConversacionHandoffPendiente(
      contexto.prisma,
      new Date('2026-09-28T12:40:00Z'),
    );

    await contexto.consumidor.consumir(eventoMensajeEntrante(chatwootConversationId, `${chatwootConversationId}-m1`));

    expect(contexto.salidaCanal.llamadas).toHaveLength(0);
  });
});
