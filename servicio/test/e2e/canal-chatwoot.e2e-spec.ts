/**
 * E2E del criterio de salida completo de la fase (`docs/fases/README.md`, fila 04: "envío con
 * reintento → cero duplicados", T7). De punta a punta, con la app real (`AppModule`) y BullMQ
 * consumiendo de verdad (`COLAS_TRABAJADORES: true`) sobre Postgres + Redis reales de
 * Testcontainers, y un `ChatwootFalso` real por HTTP:
 *
 * 1. Un evento firmado llega al webhook → inbox → el consumidor lo procesa exactamente una vez
 *    (R3/R4/CAN1, ya cubiertos en detalle por `webhook.spec.ts`/`procesador-inbox.spec.ts`; aquí
 *    solo se confirma que el camino sigue funcionando de punta a punta).
 * 2. Ese mismo consumidor dispara `SALIDA_CANAL.enviarMensajes` con una secuencia de dos mensajes;
 *    el primero se entrega directo, el segundo falla una vez (500) y se reintenta — cero
 *    duplicados en Chatwoot falso.
 */
import { Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { configurarAplicacion, OPCIONES_APLICACION } from '../../src/configurar-aplicacion.js';
import {
  CanalesModule,
  RegistroConsumidorEventosCanal,
  SALIDA_CANAL,
  type ConsumidorEventosCanal,
  type EventoCanal,
  type SalidaCanal,
} from '../../src/modulos/canales/index.js';
import { ColasModule } from '../../src/plataforma/colas/index.js';
import { CONFIGURACION, ConfiguracionModule, type Configuracion } from '../../src/plataforma/config/index.js';
import { ErroresModule } from '../../src/plataforma/errores/index.js';
import { ObservabilidadModule } from '../../src/plataforma/observabilidad/index.js';
import { PrismaModule, PrismaService } from '../../src/plataforma/prisma/index.js';
import { RedisModule } from '../../src/plataforma/redis/index.js';
import { RelojModule } from '../../src/plataforma/reloj/index.js';
import { SaludModule } from '../../src/plataforma/salud/index.js';
import { cargarFixtureChatwoot, firmarComoChatwoot } from '../soporte/chatwoot.js';
import { ChatwootFalso } from '../soporte/chatwoot-falso.js';
import { prefijoRedisDePrueba, urlPostgresDePrueba, urlRedisDePrueba } from '../soporte/infraestructura.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_AUTH_DE_PRUEBA } from '../soporte/configuracion-auth-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../soporte/configuracion-llm-de-prueba.js';

/**
 * Raíz de composición del e2e: la de `AppModule` sin `ConversacionesModule`. Este e2e prueba
 * `canales` de punta a punta con un consumidor propio (abajo); con `conversaciones` en el grafo, su
 * `onModuleInit` registraría primero el consumidor real y `RegistroConsumidorEventosCanal.registrar`
 * rechazaría el segundo (D8: "dos módulos no pueden competir por el mismo evento"). No se usa
 * `overrideModule` porque `AppModule` importa `ConversacionesModule.conGenerador(...)`, un módulo
 * dinámico que solo se puede reemplazar por identidad de objeto.
 */
@Module({
  imports: [
    ConfiguracionModule,
    RelojModule,
    ObservabilidadModule,
    ErroresModule,
    PrismaModule,
    RedisModule,
    SaludModule,
    ColasModule,
    CanalesModule,
  ],
})
class RaizSinConversaciones {}

const SECRETO_DE_PRUEBA = 'secreto-e2e-canal-chatwoot';
const RUTA_WEBHOOK = '/api/v1/webhooks/chatwoot';

function segundosUnixDePrueba(): number {
  return Math.floor((performance.timeOrigin + performance.now()) / 1000);
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
    CHATWOOT_WEBHOOK_SECRETO: SECRETO_DE_PRUEBA,
    CHATWOOT_WEBHOOK_TOLERANCIA_S: 300,
    CHATWOOT_HTTP_TIMEOUT_MS: 5000,
    // Aislado por VITEST_POOL_ID (ADR-0009): este archivo es el único e2e que arranca *workers*
    // reales de inbox y outbox a la vez.
    COLAS_PREFIJO: `${prefijoRedisDePrueba()}colas-e2e`,
    COLAS_TRABAJADORES: true,
    INBOX_MAX_INTENTOS: 5,
    INBOX_BARRIDO_MS: 30000,
    OUTBOX_MAX_INTENTOS: 5,
    // Backoff y barrido reducidos (segundos/ms reales, D12): este test corre contra el reloj de
    // pared de verdad (no hay `ClockFalso` en un e2e con BullMQ real), así que el reintento del
    // 2.º mensaje debe llegar en un tiempo razonable para la prueba.
    OUTBOX_BACKOFF_BASE_S: 1,
    OUTBOX_BACKOFF_MAX_S: 1,
    OUTBOX_BARRIDO_MS: 500,
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
    ESPERA_CLIENTE_MIN: 10,
    ESPERA_CLIENTE_BARRIDO_MS: 60000,
    ...CONFIGURACION_AGENTE_DE_PRUEBA,
    ...CONFIGURACION_LLM_DE_PRUEBA,
    ...CONFIGURACION_AUTH_DE_PRUEBA,
  };
}

async function crearAplicacion(chatwootFalso: ChatwootFalso): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({ imports: [RaizSinConversaciones] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba(chatwootFalso))
    .compile();

  const app = modulo.createNestApplication<NestExpressApplication>(OPCIONES_APLICACION);
  configurarAplicacion(app);
  await app.listen(0);
  return app;
}

function servidor(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

function llamadasAMensajes(chatwootFalso: ChatwootFalso): readonly { cuerpo: unknown }[] {
  return chatwootFalso
    .llamadasRegistradas()
    .filter((l) => l.metodo === 'POST' && l.ruta.endsWith('/messages'));
}

describe('Canal Chatwoot de punta a punta (T7, e2e, criterio de salida de la fase 04)', () => {
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

  it('evento firmado → inbox → consumidor una vez; SALIDA_CANAL con reintento → cero duplicados en Chatwoot falso', async () => {
    app = await crearAplicacion(chatwootFalso);
    const prisma = app.get(PrismaService);
    const salidaCanal = app.get<SalidaCanal>(SALIDA_CANAL);
    const registroConsumidor = app.get(RegistroConsumidorEventosCanal);

    let llamadasAlConsumidor = 0;
    const consumidorDePrueba: ConsumidorEventosCanal = {
      consumir: async (evento: EventoCanal) => {
        llamadasAlConsumidor += 1;
        if (evento.tipo !== 'mensaje-entrante') return;
        // Dispara el puerto de salida real (D9) con una secuencia de dos mensajes: el criterio de
        // salida de la fase exige que este camino, de punta a punta, no duplique ningún mensaje.
        await salidaCanal.enviarMensajes({
          idConversacion: evento.conversacion.idExterno,
          idRespuesta: 'respuesta-e2e-1',
          mensajes: [
            { tipo: 'texto', texto: 'mensaje uno' },
            { tipo: 'texto', texto: 'mensaje dos' },
          ],
        });
      },
    };
    registroConsumidor.registrar(consumidorDePrueba);

    // El 1.º mensaje se entrega con el 200 por defecto; el 2.º falla una vez (500, transitorio,
    // CAN7) y se reintenta automáticamente vía el barrido del outbox (D10).
    chatwootFalso.programarRespuesta({ status: 200, cuerpo: { id: 1 } });
    chatwootFalso.programarRespuesta({ status: 500 });

    const fixture = cargarFixtureChatwoot('mensaje-creado-entrante-texto.json');
    const timestampSegundos = segundosUnixDePrueba();
    const firma = firmarComoChatwoot(fixture.rawBody, timestampSegundos, SECRETO_DE_PRUEBA);

    const respuesta = await request(servidor(app))
      .post(RUTA_WEBHOOK)
      .set('Content-Type', 'application/json')
      .set('X-Chatwoot-Timestamp', String(timestampSegundos))
      .set('X-Chatwoot-Signature', firma)
      .send(fixture.rawBody.toString('utf8'));

    expect(respuesta.status).toBeGreaterThanOrEqual(200);
    expect(respuesta.status).toBeLessThan(300);

    // El evento entrante se procesa (inbox → consumidor) exactamente una vez (R4/CAN4).
    await vi.waitFor(
      async () => {
        const fila = await prisma.eventoEntrante.findFirstOrThrow({
          where: { origen: 'chatwoot', idExterno: 'mensaje:1' },
        });
        expect(fila.procesadoEn).not.toBeNull();
      },
      { timeout: 10_000, interval: 200 },
    );
    expect(llamadasAlConsumidor).toBe(1);

    // Las dos filas del outbox quedan entregadas, sin ningún duplicado del primer mensaje pese al
    // reintento del segundo (criterio de salida de la fase).
    await vi.waitFor(
      async () => {
        const filas = await prisma.outbox.findMany({
          where: { claveIdempotencia: { startsWith: 'canal:mensaje:1:respuesta-e2e-1:' } },
        });
        expect(filas).toHaveLength(2);
        expect(filas.every((f) => f.enviadoEn !== null && f.error === null)).toBe(true);
      },
      { timeout: 10_000, interval: 200 },
    );

    const cuerposEnviados = llamadasAMensajes(chatwootFalso).map((l) => l.cuerpo);
    const vecesQueSeEnvioMensajeUno = cuerposEnviados.filter(
      (c) => (c as { content?: string }).content === 'mensaje uno',
    ).length;
    expect(vecesQueSeEnvioMensajeUno).toBe(1);
    expect(cuerposEnviados.filter((c) => (c as { content?: string }).content === 'mensaje dos').length).toBe(2);
  }, 20_000);
});
