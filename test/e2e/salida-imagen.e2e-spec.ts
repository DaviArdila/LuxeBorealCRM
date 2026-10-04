/**
 * E2E de la Fase 07b (T1): la salida de imagen de punta a punta con la app real (`AppModule`),
 * BullMQ consumiendo de verdad y Postgres + Redis reales de Testcontainers. Un webhook firmado de
 * Chatwoot → inbox → turno → un generador que devuelve texto + imagen (el LLM llega en T2) →
 * `EnviarRespuestaTurno` → outbox → `PublicarEfectoCanal` (lee los bytes de `medios`) → `ChatwootFalso`
 * por HTTP, que recibe el texto en JSON y el collage como `multipart/form-data`. Confirma el cableado
 * que los dobles de los unitarios no pueden ver (lección de la 07a).
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configurarAplicacion, OPCIONES_APLICACION } from '../../src/configurar-aplicacion.js';
import { GENERADOR_RESPUESTA, type GeneradorRespuesta, type RespuestaTurno } from '../../src/modulos/conversaciones/index.js';
import { ALMACENAMIENTO } from '../../src/modulos/medios/index.js';
import { CONFIGURACION, type Configuracion } from '../../src/plataforma/config/index.js';
import { AlmacenamientoEnMemoria } from '../fakes/almacenamiento-en-memoria.js';
import { cargarFixtureChatwoot, firmarComoChatwoot } from '../soporte/chatwoot.js';
import { ChatwootFalso, type CuerpoMultipart } from '../soporte/chatwoot-falso.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_AUTH_DE_PRUEBA } from '../soporte/configuracion-auth-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../soporte/configuracion-llm-de-prueba.js';
import { prefijoRedisDePrueba, urlPostgresDePrueba, urlRedisDePrueba } from '../soporte/infraestructura.js';

const SECRETO = 'secreto-e2e-salida-imagen';
const RUTA_WEBHOOK = '/api/v1/webhooks/chatwoot';
const DEBOUNCE_MS = 200;
const CLAVE_COLLAGE = 'catalogo/luna/collage.jpg';

/** Generador de prueba: responde siempre con un texto y el collage de un producto (CNV10). */
class GeneradorConCollage implements GeneradorRespuesta {
  generar(): Promise<RespuestaTurno> {
    return Promise.resolve({
      pasos: [
        { paso: 'texto-1', tipo: 'texto', texto: 'Mira este modelo' },
        { paso: 'imagen-1', tipo: 'imagen', claveObjeto: CLAVE_COLLAGE, leyenda: 'Modelo Luna' },
      ],
    });
  }
}

function configuracionDePrueba(chatwootFalso: ChatwootFalso): Configuracion {
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
    COLAS_PREFIJO: `${prefijoRedisDePrueba()}colas-e2e-imagen`,
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
  };
}

async function crearAplicacion(chatwootFalso: ChatwootFalso, almacenamiento: AlmacenamientoEnMemoria): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba(chatwootFalso))
    .overrideProvider(ALMACENAMIENTO)
    .useValue(almacenamiento)
    .overrideProvider(GENERADOR_RESPUESTA)
    .useValue(new GeneradorConCollage())
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
let contador = 9000; // rango propio: agente-politicas usa 500+ y la base e2e se comparte
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

describe('Salida de imagen de punta a punta (T1 de la Fase 07b)', () => {
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

  it('CNV10 — Un texto seguido de un collage llega a Chatwoot como texto y adjunto multipart', async () => {
    const almacenamiento = new AlmacenamientoEnMemoria();
    const bytes = Buffer.from('bytes-del-collage-e2e');
    await almacenamiento.guardar(CLAVE_COLLAGE, bytes, 'image/jpeg');
    app = await crearAplicacion(chatwootFalso, almacenamiento);
    const { idConversacion, idContacto } = nuevaConversacion();
    const idMensaje = nuevoIdMensaje();
    chatwootFalso.programarTextoDeMensaje(String(idConversacion), idMensaje, 'Hola, quiero ver anillos');

    await enviarWebhook(app, { idConversacion, idContacto, idMensaje });

    await vi.waitFor(() => expect(mensajesPosteados(chatwootFalso, idConversacion)).toHaveLength(2), {
      timeout: 15_000,
      interval: 100,
    });
    const [texto, imagen] = mensajesPosteados(chatwootFalso, idConversacion).map((l) => l.cuerpo);
    expect(texto).toMatchObject({ content: expect.stringContaining('Mira este modelo') as string });
    const multipart = imagen as CuerpoMultipart;
    expect(multipart.multipart).toBe(true);
    expect(multipart.campos['content']).toBe('Modelo Luna');
    expect(multipart.archivos).toHaveLength(1);
    expect(multipart.archivos[0]?.bytes).toEqual(bytes);
    expect(multipart.archivos[0]?.tipo).toBe('image/jpeg');
    expect(multipart.archivos[0]?.nombre).toMatch(/^canal_mensaje_\d+_[A-Za-z0-9_-]+_01\.jpg$/);
  }, 40_000);
});
