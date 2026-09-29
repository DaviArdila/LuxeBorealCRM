/**
 * E2E de la Fase 07a (T7): las políticas deterministas del agente de punta a punta, con la app real
 * (`AppModule`), BullMQ consumiendo de verdad y Postgres + Redis reales de Testcontainers. Cada
 * escenario entra por un webhook firmado de Chatwoot → inbox → turno (debounce + lock) → agente →
 * outbox → `ChatwootFalso` por HTTP, y confirma con el MISMO título el escenario que ya cubren los
 * unitarios de `modulos/agente`: R12 (audio, segundo audio, imagen, tipo no manejado), AGT2 (aviso
 * de datos) y R13 (tope de turnos).
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configurarAplicacion, OPCIONES_APLICACION } from '../../src/configurar-aplicacion.js';
import { CONFIGURACION, type Configuracion } from '../../src/plataforma/config/index.js';
import { PrismaService } from '../../src/plataforma/prisma/index.js';
import { cargarFixtureChatwoot, firmarComoChatwoot } from '../soporte/chatwoot.js';
import { ChatwootFalso } from '../soporte/chatwoot-falso.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../soporte/configuracion-llm-de-prueba.js';
import { prefijoRedisDePrueba, urlPostgresDePrueba, urlRedisDePrueba } from '../soporte/infraestructura.js';

const SECRETO = 'secreto-e2e-agente-politicas';
const RUTA_WEBHOOK = '/api/v1/webhooks/chatwoot';
const DEBOUNCE_MS = 200;

/** Textos del negocio (R15, AGT3) fijados en `parametro` para no depender de los de respaldo. */
const TEXTOS = {
  mensaje_pedir_texto_audio: 'PEDIR-TEXTO-AUDIO',
  mensaje_imagen_no_procesada: 'IMAGEN-NO-PROCESADA',
  aviso_datos: 'AVISO-DE-DATOS',
  mensaje_handoff: 'HANDOFF-DENTRO-DE-HORARIO',
  mensaje_handoff_fuera_horario: 'HANDOFF-FUERA-DE-HORARIO',
} as const;

type TipoAdjunto = 'audio' | 'image' | 'sticker';

function configuracionDePrueba(chatwootFalso: ChatwootFalso, topeTurnos: number): Configuracion {
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
    COLAS_PREFIJO: `${prefijoRedisDePrueba()}colas-e2e-agente`,
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
    ...CONFIGURACION_AGENTE_DE_PRUEBA,
    AGENTE_TOPE_TURNOS: topeTurnos,
    ...CONFIGURACION_LLM_DE_PRUEBA,
  };
}

async function crearAplicacion(chatwootFalso: ChatwootFalso, topeTurnos = 12): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba(chatwootFalso, topeTurnos))
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
let contador = 500;
function nuevaConversacion(): { readonly idConversacion: number; readonly idContacto: number } {
  contador += 1;
  return { idConversacion: contador, idContacto: contador };
}
function nuevoIdMensaje(): number {
  contador += 1;
  return contador * 10;
}

interface Entrante {
  readonly idConversacion: number;
  readonly idContacto: number;
  readonly idMensaje: number;
  readonly adjunto?: TipoAdjunto;
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
  if (entrante.adjunto !== undefined) {
    evento['content'] = null;
    evento['attachments'] = [{ id: 1, file_type: entrante.adjunto }];
  }
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

function textosEnviados(falso: ChatwootFalso, idConversacion: number): string[] {
  return falso
    .llamadasRegistradas()
    .filter((l) => l.metodo === 'POST' && l.ruta.endsWith(`/conversations/${String(idConversacion)}/messages`))
    .map((l) => (l.cuerpo as { content: string }).content);
}

function estadosEspejados(falso: ChatwootFalso, idConversacion: number): string[] {
  return falso
    .llamadasRegistradas()
    .filter((l) => l.metodo === 'POST' && l.ruta.endsWith(`/conversations/${String(idConversacion)}/toggle_status`))
    .map((l) => (l.cuerpo as { status: string }).status);
}

async function esperarMensajes(falso: ChatwootFalso, idConversacion: number, cantidad: number): Promise<string[]> {
  await vi.waitFor(() => expect(textosEnviados(falso, idConversacion)).toHaveLength(cantidad), {
    timeout: 15_000,
    interval: 100,
  });
  return textosEnviados(falso, idConversacion);
}

describe('Agente: políticas deterministas de punta a punta (T7 de la Fase 07a)', () => {
  const chatwootFalso = new ChatwootFalso();
  let app: INestApplication | undefined;

  beforeAll(async () => {
    await chatwootFalso.iniciar();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    chatwootFalso.limpiar();
  });

  afterAll(async () => {
    await chatwootFalso.detener();
  });

  async function arrancar(topeTurnos?: number): Promise<INestApplication> {
    app = await crearAplicacion(chatwootFalso, topeTurnos);
    const prisma = app.get(PrismaService);
    for (const [clave, valor] of Object.entries(TEXTOS)) {
      await prisma.parametro.upsert({ where: { clave }, create: { clave, valor }, update: { valor } });
    }
    return app;
  }

  async function estadoDe(idConversacion: number): Promise<string | undefined> {
    const fila = await app?.get(PrismaService).conversacion.findUnique({
      where: { chatwootConversationId: idConversacion },
    });
    return fila?.estado;
  }

  it('R12 — Primer audio del cliente', async () => {
    const aplicacion = await arrancar();
    const { idConversacion, idContacto } = nuevaConversacion();

    await enviarWebhook(aplicacion, { idConversacion, idContacto, idMensaje: nuevoIdMensaje(), adjunto: 'audio' });

    const [respuesta] = await esperarMensajes(chatwootFalso, idConversacion, 1);
    expect(respuesta).toContain(TEXTOS.mensaje_pedir_texto_audio);
    expect(await estadoDe(idConversacion)).toBe('bot');
  }, 30_000);

  it('R12 — Segundo audio consecutivo', async () => {
    const aplicacion = await arrancar();
    const { idConversacion, idContacto } = nuevaConversacion();
    await enviarWebhook(aplicacion, { idConversacion, idContacto, idMensaje: nuevoIdMensaje(), adjunto: 'audio' });
    await esperarMensajes(chatwootFalso, idConversacion, 1);

    await enviarWebhook(aplicacion, { idConversacion, idContacto, idMensaje: nuevoIdMensaje(), adjunto: 'audio' });

    const mensajes = await esperarMensajes(chatwootFalso, idConversacion, 2);
    expect(mensajes[1]).toMatch(/^HANDOFF-(DENTRO|FUERA)-DE-HORARIO$/);
    await vi.waitFor(() => expect(estadosEspejados(chatwootFalso, idConversacion)).toContain('open'), {
      timeout: 15_000,
      interval: 100,
    });
    expect(await estadoDe(idConversacion)).toBe('handoff_pendiente');
  }, 40_000);

  it('R12 — Imagen entrante', async () => {
    const aplicacion = await arrancar();
    const { idConversacion, idContacto } = nuevaConversacion();

    await enviarWebhook(aplicacion, { idConversacion, idContacto, idMensaje: nuevoIdMensaje(), adjunto: 'image' });

    const [respuesta] = await esperarMensajes(chatwootFalso, idConversacion, 1);
    expect(respuesta).toContain(TEXTOS.mensaje_imagen_no_procesada);
  }, 30_000);

  it('R12 — Tipo no manejado', async () => {
    const aplicacion = await arrancar();
    const prisma = aplicacion.get(PrismaService);
    const { idConversacion, idContacto } = nuevaConversacion();
    const idMensaje = nuevoIdMensaje();

    await enviarWebhook(aplicacion, { idConversacion, idContacto, idMensaje, adjunto: 'sticker' });

    await vi.waitFor(
      async () => {
        const fila = await prisma.eventoEntrante.findFirstOrThrow({
          where: { origen: 'chatwoot', idExterno: `mensaje:${String(idMensaje)}` },
        });
        expect(fila.procesadoEn).not.toBeNull();
      },
      { timeout: 15_000, interval: 100 },
    );
    // Deja pasar el debounce y unos ciclos del outbox: el sticker no debe producir nada.
    await new Promise((resolver) => setTimeout(resolver, DEBOUNCE_MS * 5));
    expect(textosEnviados(chatwootFalso, idConversacion)).toEqual([]);
    expect(estadosEspejados(chatwootFalso, idConversacion)).toEqual([]);
    expect(await estadoDe(idConversacion)).toBe('bot');
  }, 30_000);

  it('AGT2 — La primera respuesta de la conversación lleva el aviso en el mismo mensaje', async () => {
    const aplicacion = await arrancar();
    const { idConversacion, idContacto } = nuevaConversacion();
    const primero = nuevoIdMensaje();
    chatwootFalso.programarTextoDeMensaje(String(idConversacion), primero, 'Hola, busco un anillo');
    await enviarWebhook(aplicacion, { idConversacion, idContacto, idMensaje: primero });
    await esperarMensajes(chatwootFalso, idConversacion, 1);
    const segundo = nuevoIdMensaje();
    chatwootFalso.programarTextoDeMensaje(String(idConversacion), segundo, 'De oro, por favor');

    await enviarWebhook(aplicacion, { idConversacion, idContacto, idMensaje: segundo });

    const mensajes = await esperarMensajes(chatwootFalso, idConversacion, 2);
    expect(mensajes[0]).toBe(`${TEXTOS.aviso_datos}\n\nHola, busco un anillo`);
    expect(mensajes[1]).toBe('De oro, por favor');
  }, 40_000);

  it('R13 — Tope de turnos alcanzado', async () => {
    const aplicacion = await arrancar(1);
    const { idConversacion, idContacto } = nuevaConversacion();
    const primero = nuevoIdMensaje();
    chatwootFalso.programarTextoDeMensaje(String(idConversacion), primero, 'Hola');
    await enviarWebhook(aplicacion, { idConversacion, idContacto, idMensaje: primero });
    await esperarMensajes(chatwootFalso, idConversacion, 1);
    const segundo = nuevoIdMensaje();
    chatwootFalso.programarTextoDeMensaje(String(idConversacion), segundo, 'Sigo aquí');

    await enviarWebhook(aplicacion, { idConversacion, idContacto, idMensaje: segundo });

    const mensajes = await esperarMensajes(chatwootFalso, idConversacion, 2);
    expect(mensajes[1]).toMatch(/^HANDOFF-(DENTRO|FUERA)-DE-HORARIO$/);
    await vi.waitFor(() => expect(estadosEspejados(chatwootFalso, idConversacion)).toContain('open'), {
      timeout: 15_000,
      interval: 100,
    });
    expect(await estadoDe(idConversacion)).toBe('handoff_pendiente');
  }, 40_000);
});
