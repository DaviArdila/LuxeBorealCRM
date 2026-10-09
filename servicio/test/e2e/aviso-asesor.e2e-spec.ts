/**
 * E2E de la Fase 12d (T1): el aviso al asesor sin traspaso de punta a punta, con la app real (`AppModule`), BullMQ
 * consumiendo de verdad y Postgres + Redis reales. Cada escenario entra por un webhook firmado de Chatwoot → inbox →
 * turno → un generador guionado (la herramienta `derivar_a_asesor` llega en la T2) → outbox → `ChatwootFalso` y
 * `TelegramFalso`. Confirma el cableado que los dobles de los unitarios no pueden ver: la marca por motivo en Redis,
 * el observador de `notificaciones` y la limpieza al pasar a `humano`.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configurarAplicacion, OPCIONES_APLICACION } from '../../src/configurar-aplicacion.js';
import {
  ASESOR_AVISADO,
  GENERADOR_RESPUESTA,
  type ConsultaAsesorAvisado,
  type GeneradorRespuesta,
  type RespuestaTurno,
} from '../../src/modulos/conversaciones/index.js';
import { ALMACENAMIENTO } from '../../src/modulos/medios/index.js';
import { CONFIGURACION, type Configuracion } from '../../src/plataforma/config/index.js';
import { PrismaService } from '../../src/plataforma/prisma/index.js';
import { ClockSistema } from '../../src/plataforma/reloj/index.js';
import { AlmacenamientoEnMemoria } from '../fakes/almacenamiento-en-memoria.js';
import { cargarFixtureChatwoot, firmarComoChatwoot } from '../soporte/chatwoot.js';
import { ChatwootFalso } from '../soporte/chatwoot-falso.js';
import { TelegramFalso } from '../soporte/telegram-falso.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_AUTH_DE_PRUEBA } from '../soporte/configuracion-auth-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../soporte/configuracion-llm-de-prueba.js';
import { prefijoRedisDePrueba, urlPostgresDePrueba, urlRedisDePrueba } from '../soporte/infraestructura.js';

/** Generador de prueba: entrega las respuestas guionadas en orden, una por turno. */
class GeneradorGuionado implements GeneradorRespuesta {
  private readonly cola: RespuestaTurno[] = [];
  llamadas = 0;

  programar(...respuestas: RespuestaTurno[]): void {
    this.cola.push(...respuestas);
  }

  generar(): Promise<RespuestaTurno> {
    this.llamadas += 1;
    const siguiente = this.cola.shift();
    if (siguiente === undefined) throw new Error('el generador guionado no tiene más respuestas');
    return Promise.resolve(siguiente);
  }
}

const SECRETO = 'secreto-e2e-aviso-asesor';
const RUTA_WEBHOOK = '/api/v1/webhooks/chatwoot';
const DEBOUNCE_MS = 200;

function configuracionDePrueba(
  chatwootFalso: ChatwootFalso,
  telegramFalso: TelegramFalso,
  extra: Partial<Configuracion> = {},
): Configuracion {
  return {
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
    CHATWOOT_URL: chatwootFalso.url(),
    CHATWOOT_ACCOUNT_ID: 1,
    CHATWOOT_BOT_TOKEN: 'token-de-prueba',
    CHATWOOT_WEBHOOK_SECRETO: SECRETO,
    CHATWOOT_WEBHOOK_TOLERANCIA_S: 300,
    CHATWOOT_HTTP_TIMEOUT_MS: 5000,
    COLAS_PREFIJO: `${prefijoRedisDePrueba()}colas-e2e-aviso-asesor`,
    COLAS_TRABAJADORES: true,
    INBOX_MAX_INTENTOS: 5,
    INBOX_BARRIDO_MS: 30000,
    OUTBOX_MAX_INTENTOS: 5,
    OUTBOX_BACKOFF_BASE_S: 1,
    OUTBOX_BACKOFF_MAX_S: 1,
    OUTBOX_BARRIDO_MS: 500,
    OUTBOX_LEASE_S: 60,
    HUMANO_TTL_HORAS: 3,
    HANDOFF_TTL_MIN: 45,
    LOCK_TURNO_TTL_S: 30,
    RATE_LIMIT_POR_HORA: 20,
    RATE_LIMIT_POR_DIA: 60,
    DEBOUNCE_MS,
    CONVERSACIONES_CONCURRENCIA: 10,
    CONVERSACIONES_BARRIDO_MS: 300000,
    HANDOFF_ESPERA_MIN: 30,
    ESPERA_CLIENTE_MIN: 10,
    ESPERA_CLIENTE_BARRIDO_MS: 60000,
    ...CONFIGURACION_AGENTE_DE_PRUEBA,
    ...CONFIGURACION_LLM_DE_PRUEBA,
    ...CONFIGURACION_AUTH_DE_PRUEBA,
    TELEGRAM_BOT_TOKEN: 'token-telegram-e2e',
    TELEGRAM_CHAT_ID: '-100555',
    TELEGRAM_API_URL: telegramFalso.url(),
    LEADS_BARRIDO_MS: 1000,
    ...extra,
  };
}


async function crearAplicacion(
  chatwootFalso: ChatwootFalso,
  telegramFalso: TelegramFalso,
  generador: GeneradorGuionado,
  almacenamiento: AlmacenamientoEnMemoria,
  extra: Partial<Configuracion> = {},
): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba(chatwootFalso, telegramFalso, extra))
    .overrideProvider(GENERADOR_RESPUESTA)
    .useValue(generador)
    .overrideProvider(ALMACENAMIENTO)
    .useValue(almacenamiento)
    .compile();
  const app = modulo.createNestApplication<NestExpressApplication>(OPCIONES_APLICACION);
  configurarAplicacion(app);
  await app.listen(0);
  return app;
}

function servidor(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

/** Ids únicos por escenario: la base y Redis se comparten entre los tests de este archivo. */
let contador = 70_000; // rango propio: cada archivo e2e usa un rango distinto
function nuevaConversacion(): { readonly idConversacion: number; readonly idContacto: number } {
  contador += 1;
  return { idConversacion: contador, idContacto: contador + 800_000 };
}
function nuevoIdMensaje(): number {
  contador += 1;
  return contador * 10;
}

interface Entrante {
  readonly idConversacion: number;
  readonly idContacto: number;
  readonly idMensaje: number;
}

async function enviarWebhook(app: INestApplication, entrante: Entrante): Promise<void> {
  const fixture = cargarFixtureChatwoot('mensaje-creado-entrante-texto.json');
  const evento = JSON.parse(fixture.rawBody.toString('utf8')) as Record<string, unknown>;
  const conversacion = evento['conversation'] as {
    id: number;
    contact_inbox: { contact_id: number; source_id: string };
  };
  conversacion.id = entrante.idConversacion;
  conversacion.contact_inbox.contact_id = entrante.idContacto;
  conversacion.contact_inbox.source_id = `57300${String(entrante.idContacto)}`;
  evento['id'] = entrante.idMensaje;
  const cuerpo = Buffer.from(JSON.stringify(evento), 'utf8');
  const segundos = Math.floor((performance.timeOrigin + performance.now()) / 1000);
  const respuesta = await request(servidor(app))
    .post(RUTA_WEBHOOK)
    .set('Content-Type', 'application/json')
    .set('X-Chatwoot-Timestamp', String(segundos))
    .set('X-Chatwoot-Signature', firmarComoChatwoot(cuerpo, segundos, SECRETO))
    .send(cuerpo.toString('utf8'));
  expect(respuesta.status).toBeGreaterThanOrEqual(200);
  expect(respuesta.status).toBeLessThan(300);
}


function mensajesPosteados(falso: ChatwootFalso, idConversacion: number): readonly { cuerpo: unknown }[] {
  return falso
    .llamadasRegistradas()
    .filter((l) => l.metodo === 'POST' && l.ruta.endsWith(`/conversations/${String(idConversacion)}/messages`));
}

function estadosEspejados(falso: ChatwootFalso, idConversacion: number): string[] {
  return falso
    .llamadasRegistradas()
    .filter((l) => l.metodo === 'POST' && l.ruta.endsWith(`/conversations/${String(idConversacion)}/toggle_status`))
    .map((l) => (l.cuerpo as { status: string }).status);
}

/** Cierra el negocio todo el día de hoy (hora de Bogotá) con una excepción de horario; devuelve cómo deshacerlo. */
async function cerrarNegocioHoy(prisma: PrismaService): Promise<() => Promise<void>> {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new ClockSistema().ahora());
  const fecha = new Date(`${hoy}T00:00:00.000Z`);
  await prisma.excepcionHorario.upsert({ where: { fecha }, create: { fecha, motivo: 'e2e fuera de horario' }, update: {} });
  return async () => {
    await prisma.excepcionHorario.deleteMany({ where: { fecha } });
  };
}

async function esperarMensajes(falso: ChatwootFalso, idConversacion: number, cantidad: number) {
  await vi.waitFor(() => expect(mensajesPosteados(falso, idConversacion)).toHaveLength(cantidad), {
    timeout: 15_000,
    interval: 100,
  });
  return mensajesPosteados(falso, idConversacion).map((l) => l.cuerpo);
}


function etiquetasPuestas(falso: ChatwootFalso, idConversacion: number): string[] {
  return falso
    .llamadasRegistradas()
    .filter((l) => l.metodo === 'POST' && l.ruta.endsWith(`/conversations/${String(idConversacion)}/labels`))
    .flatMap((l) => (l.cuerpo as { labels?: string[] }).labels ?? []);
}

/** Un mensaje saliente de un asesor humano (eco humano, R8 capa 2) en la conversación indicada. */
async function enviarEcoHumano(app: INestApplication, idConversacion: number, idMensaje: number): Promise<void> {
  const fixture = cargarFixtureChatwoot('mensaje-creado-saliente-humano.json');
  const evento = JSON.parse(fixture.rawBody.toString('utf8')) as Record<string, unknown>;
  (evento['conversation'] as { id: number }).id = idConversacion;
  evento['id'] = idMensaje;
  const cuerpo = Buffer.from(JSON.stringify(evento), 'utf8');
  const segundos = Math.floor((performance.timeOrigin + performance.now()) / 1000);
  const respuesta = await request(servidor(app))
    .post(RUTA_WEBHOOK)
    .set('Content-Type', 'application/json')
    .set('X-Chatwoot-Timestamp', String(segundos))
    .set('X-Chatwoot-Signature', firmarComoChatwoot(cuerpo, segundos, SECRETO))
    .send(cuerpo.toString('utf8'));
  expect(respuesta.status).toBeGreaterThanOrEqual(200);
  expect(respuesta.status).toBeLessThan(300);
}

const PASO = (texto: string) => ({ paso: 'texto-1', tipo: 'texto', texto }) as const;

describe('Aviso al asesor sin traspaso de punta a punta (T1 de la Fase 12d)', () => {
  const chatwootFalso = new ChatwootFalso();
  const telegramFalso = new TelegramFalso();
  let app: INestApplication | undefined;
  let generador = new GeneradorGuionado();

  beforeAll(async () => {
    await chatwootFalso.iniciar();
    await telegramFalso.iniciar();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    chatwootFalso.limpiar();
    telegramFalso.limpiar();
  });

  afterAll(async () => {
    await chatwootFalso.detener();
    await telegramFalso.detener();
  });

  async function arrancar(): Promise<INestApplication> {
    generador = new GeneradorGuionado();
    app = await crearAplicacion(chatwootFalso, telegramFalso, generador, new AlmacenamientoEnMemoria());
    return app;
  }

  async function esperarAvisos(cantidad: number): Promise<string[]> {
    await vi.waitFor(() => expect(telegramFalso.llamadasRegistradas()).toHaveLength(cantidad), {
      timeout: 15_000,
      interval: 100,
    });
    return telegramFalso.llamadasRegistradas().map((llamada) => llamada.texto ?? '');
  }

  /** Escribe como cliente en la conversación y espera la respuesta número `n` del bot. */
  async function escribir(
    aplicacion: INestApplication,
    conversacion: { idConversacion: number; idContacto: number },
    texto: string,
    respuestasEsperadas: number,
  ): Promise<void> {
    const idMensaje = nuevoIdMensaje();
    chatwootFalso.programarTextoDeMensaje(String(conversacion.idConversacion), idMensaje, texto);
    await enviarWebhook(aplicacion, { ...conversacion, idMensaje });
    await esperarMensajes(chatwootFalso, conversacion.idConversacion, respuestasEsperadas);
  }

  async function estadoDe(aplicacion: INestApplication, idConversacion: number): Promise<string> {
    const fila = await aplicacion
      .get(PrismaService)
      .conversacion.findUniqueOrThrow({ where: { chatwootConversationId: idConversacion } });
    return fila.estado;
  }

  it('CNV13 — Pide persona: un aviso por Telegram con el enlace, el bot responde y la conversación sigue en bot', async () => {
    const aplicacion = await arrancar();
    generador.programar({ pasos: [PASO('Con gusto te ayudo mientras llega un asesor')], aviso: { motivo: 'pide-persona' } });
    const conversacion = nuevaConversacion();

    await escribir(aplicacion, conversacion, 'Quiero hablar con una persona', 1);

    const [aviso] = await esperarAvisos(1);
    expect(aviso).toContain('pidió hablar con una persona');
    // NTF1/NTF5: sin datos del cliente y con el enlace que abre la conversación en Chatwoot.
    expect(aviso).not.toContain(String(conversacion.idContacto));
    expect(aviso.split('\n').find((linea) => linea.startsWith('Atender: '))).toMatch(
      new RegExp(`/app/accounts/1/conversations/${String(conversacion.idConversacion)}$`),
    );
    expect(await estadoDe(aplicacion, conversacion.idConversacion)).toBe('bot');
    expect(estadosEspejados(chatwootFalso, conversacion.idConversacion)).toEqual([]);
  }, 40_000);

  it('CNV14 — Dos peticiones seguidas de asesor generan un solo aviso y el bot responde las dos veces', async () => {
    const aplicacion = await arrancar();
    generador.programar(
      { pasos: [PASO('Te ayudo yo mientras llega un asesor')], aviso: { motivo: 'pide-persona' } },
      { pasos: [PASO('Sigo contigo')], aviso: { motivo: 'pide-asesor' } },
    );
    const conversacion = nuevaConversacion();

    await escribir(aplicacion, conversacion, 'Quiero hablar con un asesor', 1);
    await esperarAvisos(1);
    await escribir(aplicacion, conversacion, '¿Ya viene?', 2);

    // Margen para que un segundo aviso, si existiera, ya hubiera llegado al Telegram falso.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(telegramFalso.llamadasRegistradas()).toHaveLength(1);
    expect(generador.llamadas).toBe(2);
    expect(await estadoDe(aplicacion, conversacion.idConversacion)).toBe('bot');
  }, 40_000);

  it('NTF8 — Un motivo distinto avisa de nuevo en la misma sesión bot, con su propio texto', async () => {
    const aplicacion = await arrancar();
    generador.programar(
      { pasos: [PASO('Te ayudo mientras llega un asesor')], aviso: { motivo: 'pide-asesor' } },
      { pasos: [PASO('No alcanzo a oír audios')], aviso: { motivo: 'audio-repetido' } },
    );
    const conversacion = nuevaConversacion();

    await escribir(aplicacion, conversacion, 'Necesito un asesor', 1);
    await esperarAvisos(1);
    await escribir(aplicacion, conversacion, 'otro mensaje', 2);

    const avisos = await esperarAvisos(2);
    expect(avisos[0]).toContain('bot pidió que un asesor intervenga');
    expect(avisos[1]).toContain('insiste con audios');
    expect(await estadoDe(aplicacion, conversacion.idConversacion)).toBe('bot');
  }, 40_000);

  it('CNV11 — Lead caliente etiqueta la conversación en Chatwoot sin traspasarla', async () => {
    const aplicacion = await arrancar();
    generador.programar({ pasos: [PASO('Perfecto, sigo contigo')], aviso: { motivo: 'lead-caliente' } });
    const conversacion = nuevaConversacion();

    await escribir(aplicacion, conversacion, 'Quiero pagar ya', 1);

    await vi.waitFor(
      () => expect(etiquetasPuestas(chatwootFalso, conversacion.idConversacion)).toContain('lead-caliente'),
      { timeout: 15_000, interval: 100 },
    );
    expect(await estadoDe(aplicacion, conversacion.idConversacion)).toBe('bot');
    expect(estadosEspejados(chatwootFalso, conversacion.idConversacion)).toEqual([]);
  }, 40_000);

  it('CNV14 — El eco humano pasa la conversación a humano, borra las marcas y silencia al bot', async () => {
    const aplicacion = await arrancar();
    generador.programar({ pasos: [PASO('Te ayudo mientras llega un asesor')], aviso: { motivo: 'pide-persona' } });
    const conversacion = nuevaConversacion();
    await escribir(aplicacion, conversacion, 'Quiero un asesor', 1);
    await esperarAvisos(1);
    const consulta = aplicacion.get<ConsultaAsesorAvisado>(ASESOR_AVISADO);
    const conversacionBd = await aplicacion
      .get(PrismaService)
      .conversacion.findUniqueOrThrow({ where: { chatwootConversationId: conversacion.idConversacion } });
    expect(await consulta.estaAvisado(conversacionBd.id)).toBe(true); // CNV15

    await enviarEcoHumano(aplicacion, conversacion.idConversacion, nuevoIdMensaje());

    await vi.waitFor(async () => expect(await estadoDe(aplicacion, conversacion.idConversacion)).toBe('humano'), {
      timeout: 15_000,
      interval: 100,
    });
    expect(await consulta.estaAvisado(conversacionBd.id)).toBe(false);
    // El bot calla: un mensaje del cliente ya no invoca al generador.
    const antes = generador.llamadas;
    const idMensaje = nuevoIdMensaje();
    chatwootFalso.programarTextoDeMensaje(String(conversacion.idConversacion), idMensaje, 'hola, ¿sigues ahí?');
    await enviarWebhook(aplicacion, { ...conversacion, idMensaje });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(generador.llamadas).toBe(antes);
  }, 40_000);

  it('NTF8 — Fuera de horario el aviso también sale', async () => {
    const aplicacion = await arrancar();
    const abrirDeNuevo = await cerrarNegocioHoy(aplicacion.get(PrismaService));
    try {
      generador.programar({ pasos: [PASO('Te ayudo mientras llega un asesor')], aviso: { motivo: 'pide-asesor' } });
      const conversacion = nuevaConversacion();

      await escribir(aplicacion, conversacion, 'Necesito un asesor', 1);

      await esperarAvisos(1);
      expect(await estadoDe(aplicacion, conversacion.idConversacion)).toBe('bot');
    } finally {
      await abrirDeNuevo();
    }
  }, 40_000);

  it('CNV8 — Una falla del modelo sigue llevando a handoff pendiente, con su aviso de traspaso', async () => {
    const aplicacion = await arrancar();
    generador.programar({ pasos: [PASO('Tuvimos un problema técnico')], handoff: { motivo: 'fallo-llm' } });
    const conversacion = nuevaConversacion();

    await escribir(aplicacion, conversacion, 'Hola', 1);

    await vi.waitFor(async () => expect(await estadoDe(aplicacion, conversacion.idConversacion)).toBe('handoff_pendiente'), {
      timeout: 15_000,
      interval: 100,
    });
    const [aviso] = await esperarAvisos(1);
    expect(aviso).toContain('Traspaso');
    expect(aviso).toContain('falla técnica');
  }, 40_000);
});
