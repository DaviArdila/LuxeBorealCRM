import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { CanalesModule, SALIDA_CANAL, type SalidaCanal } from '../../../src/modulos/canales/index.js';
import { ADAPTADOR_CANAL, type AdaptadorCanal } from '../../../src/modulos/canales/puertos/adaptador-canal.js';
import { ConversacionesModule } from '../../../src/modulos/conversaciones/conversaciones.module.js';
import { ColasModule } from '../../../src/plataforma/colas/index.js';
import { CONFIGURACION, ConfiguracionModule, type Configuracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { PublicadorOutbox } from '../../../src/plataforma/outbox/index.js';
import { CLOCK, RelojModule } from '../../../src/plataforma/reloj/index.js';
import { ClockFalso } from '../../fakes/clock-falso.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';
import { prefijoRedisDePrueba, urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

type EstadoAtencion = 'bot' | 'handoff_pendiente' | 'humano';

/**
 * Adaptador de canal falso: registra los envíos y permite simular que la conversación cambia de
 * estado justo después de publicar un paso (un asesor que toma el control a mitad de la secuencia).
 */
class AdaptadorCanalFalso implements AdaptadorCanal {
  readonly enviados: string[] = [];
  despuesDelPrimerEnvio: (() => Promise<void>) | undefined;

  async enviarTexto(_idConversacion: string, texto: string): Promise<void> {
    this.enviados.push(texto);
    if (this.enviados.length === 1) await this.despuesDelPrimerEnvio?.();
  }

  existeMensajeConMarca(): Promise<boolean> {
    return Promise.resolve(false);
  }

  cambiarEstado(): Promise<void> {
    return Promise.resolve();
  }

  agregarEtiquetas(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * `CanalesModule` real (outbox de Postgres + publicador real) más `ConversacionesModule` real, que
 * registra su guardia en `onModuleInit`. Solo el adaptador HTTP de Chatwoot se sustituye. Los
 * trabajadores están apagados: la suite llama `publicarPendientes()` a mano.
 */
async function crearContexto(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
  adaptador: AdaptadorCanalFalso;
  salidaCanal: SalidaCanal;
  publicador: PublicadorOutbox;
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
    DEBOUNCE_MS: 3000,
    CONVERSACIONES_CONCURRENCIA: 10,
    CONVERSACIONES_BARRIDO_MS: 300000,
    HANDOFF_ESPERA_MIN: 30,
    ...CONFIGURACION_LLM_DE_PRUEBA,
  };
  const adaptador = new AdaptadorCanalFalso();

  const modulo = await Test.createTestingModule({
    imports: [ConfiguracionModule, RelojModule, PrismaModule, ColasModule, CanalesModule, ConversacionesModule],
  })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba)
    .overrideProvider(CLOCK)
    .useValue(new ClockFalso(new Date('2030-01-01T00:00:00.000Z')))
    .overrideProvider(ADAPTADOR_CANAL)
    .useValue(adaptador)
    .compile();

  const app = modulo.createNestApplication();
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    adaptador,
    salidaCanal: app.get<SalidaCanal>(SALIDA_CANAL),
    publicador: app.get(PublicadorOutbox),
  };
}

async function crearConversacion(prisma: PrismaService, estado: EstadoAtencion): Promise<string> {
  const contacto = await prisma.contacto.create({ data: {} });
  const conversacion = await prisma.conversacion.create({
    data: {
      contactoId: contacto.id,
      chatwootConversationId: Math.floor(Math.random() * 1_000_000_000),
      canal: 'whatsapp',
      estado,
    },
  });
  return conversacion.id;
}

function textos(...valores: string[]): { tipo: 'texto'; texto: string }[] {
  return valores.map((texto) => ({ tipo: 'texto', texto }));
}

async function estadoDelOutbox(
  prisma: PrismaService,
  idConv: string,
  idRespuesta: string,
): Promise<{ enviado: boolean; error: string | null }[]> {
  const filas = await prisma.outbox.findMany({
    where: { claveIdempotencia: { startsWith: `canal:mensaje:${idConv}:${idRespuesta}:` } },
    orderBy: { claveIdempotencia: 'asc' },
  });
  return filas.map((f) => ({ enviado: f.enviadoEn !== null, error: f.error }));
}

describe('Guardia de envío por paso con outbox y publicador reales (T3, integración, CAN9/CNV9/R5)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('CNV9 — La conversación pasa a humano entre dos pasos ya encolados', async () => {
    const contexto = await crearContexto();
    app = contexto.app;
    const idConv = await crearConversacion(contexto.prisma, 'bot');
    await contexto.salidaCanal.enviarMensajes({
      idConversacion: idConv,
      idRespuesta: 'r-corte',
      requiereEstado: 'bot',
      mensajes: textos('uno', 'dos', 'tres'),
    });
    // Un asesor toma la conversación justo después de que sale el primer paso.
    contexto.adaptador.despuesDelPrimerEnvio = async () => {
      await contexto.prisma.conversacion.update({ where: { id: idConv }, data: { estado: 'humano' } });
    };

    await contexto.publicador.publicarPendientes();

    expect(contexto.adaptador.enviados).toEqual(['uno']);
    expect(await estadoDelOutbox(contexto.prisma, idConv, 'r-corte')).toEqual([
      { enviado: true, error: null },
      { enviado: false, error: 'permanente: estado-cambio' },
      { enviado: false, error: 'secuencia abortada' },
    ]);
  });

  it('CAN9 — La guardia niega el envío y la secuencia se aborta', async () => {
    const contexto = await crearContexto();
    app = contexto.app;
    const idConv = await crearConversacion(contexto.prisma, 'humano');
    await contexto.salidaCanal.enviarMensajes({
      idConversacion: idConv,
      idRespuesta: 'r-negada',
      requiereEstado: 'bot',
      mensajes: textos('uno', 'dos'),
    });

    await contexto.publicador.publicarPendientes();

    expect(contexto.adaptador.enviados).toEqual([]);
    expect(await estadoDelOutbox(contexto.prisma, idConv, 'r-negada')).toEqual([
      { enviado: false, error: 'permanente: estado-cambio' },
      { enviado: false, error: 'secuencia abortada' },
    ]);
  });

  it('una secuencia cuya conversación sigue en el estado requerido se publica completa', async () => {
    const contexto = await crearContexto();
    app = contexto.app;
    const idConv = await crearConversacion(contexto.prisma, 'bot');
    await contexto.salidaCanal.enviarMensajes({
      idConversacion: idConv,
      idRespuesta: 'r-ok',
      requiereEstado: 'bot',
      mensajes: textos('uno', 'dos'),
    });

    await contexto.publicador.publicarPendientes();

    expect(contexto.adaptador.enviados).toEqual(['uno', 'dos']);
    expect(await estadoDelOutbox(contexto.prisma, idConv, 'r-ok')).toEqual([
      { enviado: true, error: null },
      { enviado: true, error: null },
    ]);
  });

  it('CNV9 — El aviso de espera solo sale si la conversación sigue esperando', async () => {
    const contexto = await crearContexto();
    app = contexto.app;
    const esperando = await crearConversacion(contexto.prisma, 'handoff_pendiente');
    const tomada = await crearConversacion(contexto.prisma, 'humano'); // un asesor la tomó antes de publicar
    for (const idConversacion of [esperando, tomada]) {
      await contexto.salidaCanal.enviarMensajes({
        idConversacion,
        idRespuesta: 'espera',
        requiereEstado: 'handoff_pendiente',
        mensajes: textos(`aviso-${idConversacion}`),
      });
    }

    await contexto.publicador.publicarPendientes();

    expect(contexto.adaptador.enviados).toEqual([`aviso-${esperando}`]);
    expect(await estadoDelOutbox(contexto.prisma, tomada, 'espera')).toEqual([
      { enviado: false, error: 'permanente: estado-cambio' },
    ]);
  });
});
