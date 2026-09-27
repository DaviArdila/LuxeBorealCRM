import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../../src/app.module.js';
import { configurarAplicacion, OPCIONES_APLICACION } from '../../../src/configurar-aplicacion.js';
import { CONFIGURACION, type Configuracion } from '../../../src/plataforma/config/index.js';
import { PrismaService } from '../../../src/plataforma/prisma/index.js';
import { cargarFixtureChatwoot, firmarComoChatwoot } from '../../soporte/chatwoot.js';
import { prefijoRedisDePrueba, urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

const SECRETO_DE_PRUEBA = 'secreto-de-prueba-webhook';
const RUTA_WEBHOOK = '/api/v1/webhooks/chatwoot';

/**
 * Segundos Unix "ahora" sin `Date.now()`/`new Date()` (regla de lint "Reloj", D10): combina
 * `performance.timeOrigin` (época en ms de cuando arrancó este proceso) con `performance.now()`
 * (ms transcurridos desde entonces) — la app real usa `CLOCK` inyectado (T2/T3); este archivo solo
 * firma peticiones de prueba, nunca lógica de negocio.
 */
function segundosUnixDePrueba(): number {
  return Math.floor((performance.timeOrigin + performance.now()) / 1000);
}

function configuracionDePrueba(): Configuracion {
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
    CHATWOOT_URL: 'http://localhost:3001',
    CHATWOOT_ACCOUNT_ID: 1,
    CHATWOOT_BOT_TOKEN: '',
    CHATWOOT_WEBHOOK_SECRETO: SECRETO_DE_PRUEBA,
    CHATWOOT_WEBHOOK_TOLERANCIA_S: 300,
    CHATWOOT_HTTP_TIMEOUT_MS: 10000,
    // T4 (D6): prefijo aislado por VITEST_POOL_ID (ADR-0009) — este archivo ya encola de verdad
    // (ColaEventosEntrantesBullmq sustituyó al doble de T3), así que un prefijo compartido con
    // otro archivo de test de `canales/` correría el riesgo de que sus jobs se mezclaran en el
    // mismo Redis de Testcontainers. `COLAS_TRABAJADORES: false`: este archivo prueba la capa HTTP
    // del webhook (D5: "Postgres es la verdad, la cola es solo el disparador"), no el
    // procesamiento en segundo plano — mismo criterio que los contextos de generación de contrato,
    // pero aquí por alcance del test, no porque falte Redis real.
    COLAS_PREFIJO: `${prefijoRedisDePrueba()}colas`,
    COLAS_TRABAJADORES: false,
    INBOX_MAX_INTENTOS: 5,
    INBOX_BARRIDO_MS: 30000,
  };
}

/**
 * Arranca la app completa con `configurarAplicacion` + `OPCIONES_APLICACION` (D2, D14): mismo
 * cableado exacto que `main.ts`, incluido `rawBody: true` — riesgo técnico nº 1 de esta tarea
 * (verificar con un test real, no asumir).
 */
async function crearAplicacion(): Promise<NestExpressApplication> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba())
    .compile();

  const app = modulo.createNestApplication<NestExpressApplication>(OPCIONES_APLICACION);
  configurarAplicacion(app);
  await app.init();
  return app;
}

function servidor(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

interface CuerpoRespuestaWebhook {
  readonly estado?: string;
  readonly codigo?: string;
}

async function enviarFixtureFirmado(
  app: INestApplication,
  nombreFixture: string,
  opciones: { readonly conFirma?: boolean; readonly timestampSegundos?: number } = {},
) {
  const fixture = cargarFixtureChatwoot(nombreFixture);
  const timestampSegundos = opciones.timestampSegundos ?? segundosUnixDePrueba();
  const peticion = request(servidor(app))
    .post(RUTA_WEBHOOK)
    .set('Content-Type', 'application/json')
    .set('X-Chatwoot-Timestamp', String(timestampSegundos));

  if (opciones.conFirma !== false) {
    const firma = firmarComoChatwoot(fixture.rawBody, timestampSegundos, SECRETO_DE_PRUEBA);
    peticion.set('X-Chatwoot-Signature', firma);
  }

  // `.send(Buffer)` con `Content-Type: application/json` hace que superagent lo trate como un
  // objeto a serializar (`{"type":"Buffer","data":[...]}`), no como bytes crudos (riesgo técnico
  // nº 1 de esta tarea, descubierto con este mismo test en RED): enviar la forma de texto UTF-8
  // reproduce byte a byte el fixture original, que es exactamente lo que `firmarComoChatwoot`
  // firmó — los fixtures son JSON UTF-8 sin BOM, así que el viaje de ida y vuelta es idéntico.
  return peticion.send(fixture.rawBody.toString('utf8'));
}

describe('Webhook de Chatwoot (T3, integración, R3/R4/CAN1-CAN3/CAN5)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('R3 — Evento con firma válida: responde 2xx y deja la fila redactada en evento_entrante', async () => {
    app = await crearAplicacion();
    const prisma = app.get(PrismaService);

    const respuesta = await enviarFixtureFirmado(app, 'mensaje-creado-entrante-texto.json');
    const cuerpo = respuesta.body as CuerpoRespuestaWebhook;

    expect(respuesta.status).toBeGreaterThanOrEqual(200);
    expect(respuesta.status).toBeLessThan(300);
    expect(cuerpo.estado).toBe('registrado');

    const fila = await prisma.eventoEntrante.findFirstOrThrow({
      where: { origen: 'chatwoot', idExterno: 'mensaje:1' },
    });
    expect(fila.payload).not.toBeNull();
  });

  it('R3 — Evento con firma inválida: responde 401 y no deja fila', async () => {
    app = await crearAplicacion();
    const prisma = app.get(PrismaService);
    const antes = await prisma.eventoEntrante.count();
    const fixture = cargarFixtureChatwoot('mensaje-creado-entrante-texto.json');
    const timestampSegundos = segundosUnixDePrueba();

    const respuesta = await request(servidor(app))
      .post(RUTA_WEBHOOK)
      .set('Content-Type', 'application/json')
      .set('X-Chatwoot-Timestamp', String(timestampSegundos))
      .set('X-Chatwoot-Signature', 'sha256=firma-completamente-invalida-0000000000000000000000000000000000000000000000000000000000000000')
      .send(fixture.rawBody.toString('utf8'));
    const cuerpo = respuesta.body as CuerpoRespuestaWebhook;

    expect(respuesta.status).toBe(401);
    expect(cuerpo.codigo).toBe('firma-invalida');
    // Cuenta total, no filtrada por idExterno (D5/2): el mismo fixture ya pudo registrarse en un
    // test anterior de este archivo con firma válida — lo que este caso exige es que ESTE envío,
    // rechazado, no agregue ninguna fila nueva, sin asumir que la tabla empieza vacía.
    const despues = await prisma.eventoEntrante.count();
    expect(despues).toBe(antes);
  });

  it('CAN2 — Una petición sin cabecera de firma se rechaza sin registrar nada', async () => {
    app = await crearAplicacion();
    const prisma = app.get(PrismaService);
    const antes = await prisma.eventoEntrante.count();

    const respuesta = await enviarFixtureFirmado(app, 'mensaje-creado-entrante-texto.json', { conFirma: false });

    expect(respuesta.status).toBe(401);
    const despues = await prisma.eventoEntrante.count();
    expect(despues).toBe(antes);
  });

  it('CAN3 — Un evento de un tipo distinto a los reconocidos se ignora sin registrarse', async () => {
    app = await crearAplicacion();
    const prisma = app.get(PrismaService);
    const antes = await prisma.eventoEntrante.count();

    const respuesta = await enviarFixtureFirmado(app, 'evento-ignorado-conversacion-actualizada.json');
    const cuerpo = respuesta.body as CuerpoRespuestaWebhook;

    expect(respuesta.status).toBeGreaterThanOrEqual(200);
    expect(respuesta.status).toBeLessThan(300);
    expect(cuerpo.estado).toBe('ignorado');
    const despues = await prisma.eventoEntrante.count();
    expect(despues).toBe(antes);
  });

  it('CAN1 — El webhook responde antes de 500 ms tras registrar el evento', async () => {
    app = await crearAplicacion();

    const inicio = performance.now();
    const respuesta = await enviarFixtureFirmado(app, 'conversacion-estado-open.json');
    const duracionMs = performance.now() - inicio;

    expect(respuesta.status).toBeGreaterThanOrEqual(200);
    expect(respuesta.status).toBeLessThan(300);
    expect(duracionMs).toBeLessThan(500);
  });

  it('CAN5 — Un evento con texto y adjuntos se registra sin ese contenido, y el teléfono nunca queda', async () => {
    app = await crearAplicacion();
    const prisma = app.get(PrismaService);

    await enviarFixtureFirmado(app, 'mensaje-creado-entrante-adjunto.json');

    const fila = await prisma.eventoEntrante.findFirstOrThrow({
      where: { origen: 'chatwoot', idExterno: 'mensaje:2' },
    });
    const payloadSerializado = JSON.stringify(fila.payload);

    expect(payloadSerializado).not.toMatch(/Aqui una foto del diseno|573001112233|pixel\.png|Cliente Ejemplo/);
  });

  it('R4 — Reintento del proveedor sobre un evento entrante: el mismo evento firmado dos veces produce una sola fila', async () => {
    app = await crearAplicacion();
    const prisma = app.get(PrismaService);
    const timestampSegundos = segundosUnixDePrueba();

    const primera = await enviarFixtureFirmado(app, 'conversacion-estado-resolved.json', { timestampSegundos });
    const segunda = await enviarFixtureFirmado(app, 'conversacion-estado-resolved.json', { timestampSegundos });

    expect((primera.body as CuerpoRespuestaWebhook).estado).toBe('registrado');
    expect((segunda.body as CuerpoRespuestaWebhook).estado).toBe('duplicado');

    const fixture = cargarFixtureChatwoot('conversacion-estado-resolved.json');
    const evento = fixture.json as { readonly id: number; readonly status: string };
    // El id_externo real incluye el timestamp (D4, sin X-Chatwoot-Delivery en este envío); ambas
    // peticiones comparten el mismo `timestampSegundos`, así que su prefijo es idéntico — a lo
    // sumo una fila debe sobrevivir (R4, dedupe por UNIQUE(origen, id_externo)).
    const filasDelPrefijo = await prisma.eventoEntrante.findMany({
      where: { origen: 'chatwoot', idExterno: { startsWith: `estado:${evento.id}:${evento.status}:` } },
    });
    expect(filasDelPrefijo).toHaveLength(1);
  });

  it('D2 — Un cuerpo mayor al límite de 1 MB responde 413 problem+json', async () => {
    app = await crearAplicacion();
    const timestampSegundos = segundosUnixDePrueba();
    const cuerpoGigante = Buffer.from(
      JSON.stringify({ event: 'message_created', relleno: 'x'.repeat(1024 * 1024 + 1024) }),
    );
    const firma = firmarComoChatwoot(cuerpoGigante, timestampSegundos, SECRETO_DE_PRUEBA);

    const respuesta = await request(servidor(app))
      .post(RUTA_WEBHOOK)
      .set('Content-Type', 'application/json')
      .set('X-Chatwoot-Timestamp', String(timestampSegundos))
      .set('X-Chatwoot-Signature', firma)
      .send(cuerpoGigante.toString('utf8'));

    expect(respuesta.status).toBe(413);
    expect(respuesta.type).toBe('application/problem+json');
    const cuerpo = respuesta.body as CuerpoRespuestaWebhook;
    expect(cuerpo.codigo).toBe('carga-demasiado-grande');
  });

  it('D2 — Un cuerpo que no es JSON válido responde 400 problem+json, sin registrar nada', async () => {
    app = await crearAplicacion();
    const prisma = app.get(PrismaService);
    const antes = await prisma.eventoEntrante.count();

    const respuesta = await request(servidor(app))
      .post(RUTA_WEBHOOK)
      .set('Content-Type', 'application/json')
      .set('X-Chatwoot-Timestamp', String(segundosUnixDePrueba()))
      .send('{"event": "message_created", "roto":');

    expect(respuesta.status).toBe(400);
    expect(respuesta.type).toBe('application/problem+json');
    const despues = await prisma.eventoEntrante.count();
    expect(despues).toBe(antes);
  });
});
