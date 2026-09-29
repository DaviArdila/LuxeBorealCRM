import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CanalesModule, SALIDA_CANAL, type SalidaCanal } from '../../../src/modulos/canales/index.js';
import { CONFIGURACION, ConfiguracionModule, type Configuracion } from '../../../src/plataforma/config/index.js';
import { CLOCK, RelojModule } from '../../../src/plataforma/reloj/index.js';
import { ColasModule } from '../../../src/plataforma/colas/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { PublicadorOutbox } from '../../../src/plataforma/outbox/index.js';
import { ClockFalso } from '../../fakes/clock-falso.js';
import { ChatwootFalso } from '../../soporte/chatwoot-falso.js';
import { prefijoRedisDePrueba, urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';

/**
 * Conecta `canales` con el outbox genérico contra un `ChatwootFalso` real (T7, D9/D10/D13, CAN7,
 * R4 escenario 2). `COLAS_TRABAJADORES: false`: esta suite llama `PublicadorOutbox.publicarPendientes()`
 * directamente (mismo criterio que `test/integracion/outbox/publicador-outbox.spec.ts` de T6), con
 * un `ClockFalso` para controlar el backoff (D12) sin esperas reales.
 */
async function crearAplicacion(
  chatwootFalso: ChatwootFalso,
  configuracionParcial: Partial<Configuracion> = {},
): Promise<{ app: INestApplication; clock: ClockFalso }> {
  const clock = new ClockFalso(new Date('2030-01-01T00:00:00.000Z'));
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
    CHATWOOT_URL: chatwootFalso.url(),
    CHATWOOT_ACCOUNT_ID: 1,
    CHATWOOT_BOT_TOKEN: 'token-de-prueba',
    CHATWOOT_WEBHOOK_SECRETO: '',
    CHATWOOT_WEBHOOK_TOLERANCIA_S: 300,
    CHATWOOT_HTTP_TIMEOUT_MS: 5000,
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
    ...CONFIGURACION_AGENTE_DE_PRUEBA,
    ...CONFIGURACION_LLM_DE_PRUEBA,
    ...configuracionParcial,
  };

  const modulo = await Test.createTestingModule({
    imports: [ConfiguracionModule, RelojModule, PrismaModule, ColasModule, CanalesModule],
  })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba)
    .overrideProvider(CLOCK)
    .useValue(clock)
    .compile();

  const app = modulo.createNestApplication();
  await app.init();
  return { app, clock };
}

function llamadasAMensajes(chatwootFalso: ChatwootFalso): readonly { cuerpo: unknown }[] {
  return chatwootFalso
    .llamadasRegistradas()
    .filter((l) => l.metodo === 'POST' && l.ruta.endsWith('/messages'));
}

describe('SalidaCanalOutbox + PublicarEfectoCanal contra Chatwoot falso (T7, integración, CAN7/R4/D13)', () => {
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

  it('CAN7 — Un 429 o 5xx de Chatwoot se reintenta con backoff', async () => {
    const arrancado = await crearAplicacion(chatwootFalso);
    app = arrancado.app;
    const { clock } = arrancado;
    const salidaCanal = app.get<SalidaCanal>(SALIDA_CANAL);
    const publicador = app.get(PublicadorOutbox);
    const prisma = app.get(PrismaService);
    const idConversacion = randomUUID().slice(0, 8);
    const idRespuesta = 'r1';

    chatwootFalso.programarRespuesta({ status: 500 });

    await salidaCanal.enviarMensajes({ idConversacion, idRespuesta, mensajes: [{ tipo: 'texto', texto: 'hola' }] });
    await publicador.publicarPendientes();

    let fila = await prisma.outbox.findFirstOrThrow({
      where: { claveIdempotencia: `canal:mensaje:${idConversacion}:${idRespuesta}:00` },
    });
    // Primer fallo transitorio: sigue pendiente (sin `error`), con backoff, nunca error definitivo.
    expect(fila.error).toBeNull();
    expect(fila.enviadoEn).toBeNull();
    expect(llamadasAMensajes(chatwootFalso)).toHaveLength(1);

    clock.avanzar(15_000); // backoff del 1.º fallo transitorio (D12): 15 s
    await publicador.publicarPendientes();

    fila = await prisma.outbox.findFirstOrThrow({ where: { id: fila.id } });
    expect(fila.error).toBeNull();
    expect(fila.enviadoEn).not.toBeNull();
    expect(llamadasAMensajes(chatwootFalso)).toHaveLength(2);
  });

  it('CAN7 — Un 4xx de Chatwoot falla de inmediato sin reintentar', async () => {
    const arrancado = await crearAplicacion(chatwootFalso);
    app = arrancado.app;
    const { clock } = arrancado;
    const salidaCanal = app.get<SalidaCanal>(SALIDA_CANAL);
    const publicador = app.get(PublicadorOutbox);
    const prisma = app.get(PrismaService);
    const idConversacion = randomUUID().slice(0, 8);
    const idRespuesta = 'r1';

    chatwootFalso.programarRespuesta({ status: 404 });

    await salidaCanal.enviarMensajes({ idConversacion, idRespuesta, mensajes: [{ tipo: 'texto', texto: 'hola' }] });
    await publicador.publicarPendientes();

    const fila = await prisma.outbox.findFirstOrThrow({
      where: { claveIdempotencia: `canal:mensaje:${idConversacion}:${idRespuesta}:00` },
    });
    expect(fila.error).toBe('permanente: POST /api/v1/accounts/1/conversations/' + idConversacion + '/messages: 404');
    expect(fila.enviadoEn).toBeNull();

    // Ningún reintento adicional, ni siquiera tras avanzar el reloj y volver a publicar (CAN7).
    clock.avanzar(300_000);
    await publicador.publicarPendientes();
    expect(llamadasAMensajes(chatwootFalso)).toHaveLength(1);
  });

  it('R4 — Reintento de un job de envío tras un fallo', async () => {
    const arrancado = await crearAplicacion(chatwootFalso);
    app = arrancado.app;
    const { clock } = arrancado;
    const salidaCanal = app.get<SalidaCanal>(SALIDA_CANAL);
    const publicador = app.get(PublicadorOutbox);
    const prisma = app.get(PrismaService);
    const idConversacion = randomUUID().slice(0, 8);
    const idRespuesta = 'r1';

    // El 1.º mensaje se entrega normal (sin respuesta programada, usa el 200 por defecto); el 2.º
    // falla una vez (500) y se reintenta; el 3.º nunca se intenta mientras el 2.º siga pendiente
    // (D10, orden estricto por grupo).
    chatwootFalso.programarRespuesta({ status: 200, cuerpo: { id: 1 } });
    chatwootFalso.programarRespuesta({ status: 500 });

    await salidaCanal.enviarMensajes({
      idConversacion,
      idRespuesta,
      mensajes: [
        { tipo: 'texto', texto: 'mensaje uno' },
        { tipo: 'texto', texto: 'mensaje dos' },
        { tipo: 'texto', texto: 'mensaje tres' },
      ],
    });

    await publicador.publicarPendientes();
    // La misma llamada a `publicarPendientes` ya encadena varias "vueltas" (D10): "mensaje uno" se
    // entrega y, en la vuelta siguiente, "mensaje dos" se intenta y falla (500) — "mensaje tres"
    // sigue bloqueado por "mensaje dos", que quedó pendiente (D10, orden estricto por grupo).
    expect(llamadasAMensajes(chatwootFalso).map((l) => l.cuerpo)).toMatchObject([
      { content: 'mensaje uno' },
      { content: 'mensaje dos' },
    ]);

    clock.avanzar(15_000);
    await publicador.publicarPendientes();

    // Criterio de salida de la fase (cero duplicados): "mensaje uno", ya entregado, nunca se
    // reenvía; "mensaje dos" se reintenta una vez (su propio intento anterior falló con un 500
    // definitivo, no una respuesta perdida) y "mensaje tres" llega después, en orden.
    const cuerposEnviados = llamadasAMensajes(chatwootFalso).map((l) => l.cuerpo);
    expect(cuerposEnviados).toMatchObject([
      { content: 'mensaje uno' },
      { content: 'mensaje dos' },
      { content: 'mensaje dos' },
      { content: 'mensaje tres' },
    ]);
    const vecesQueSeEnvioMensajeUno = cuerposEnviados.filter(
      (c) => (c as { content?: string }).content === 'mensaje uno',
    ).length;
    expect(vecesQueSeEnvioMensajeUno).toBe(1);

    const filas = await prisma.outbox.findMany({
      where: { claveIdempotencia: { startsWith: `canal:mensaje:${idConversacion}:${idRespuesta}:` } },
      orderBy: { claveIdempotencia: 'asc' },
    });
    expect(filas).toHaveLength(3);
    expect(filas.every((f) => f.enviadoEn !== null && f.error === null)).toBe(true);
  });
});
