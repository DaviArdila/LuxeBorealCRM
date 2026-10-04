import { BullModule } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsumidorRegistrador } from '../../../src/modulos/canales/aplicacion/consumidor-registrador.js';
import { ProcesarEventoEntrante } from '../../../src/modulos/canales/aplicacion/procesar-evento-entrante.js';
import { RegistroConsumidorEventosCanal } from '../../../src/modulos/canales/aplicacion/registro-consumidor-eventos-canal.js';
import type { EventoCanal } from '../../../src/modulos/canales/dominio/evento-canal.js';
import {
  ColaEventosEntrantesBullmq,
  NOMBRE_COLA_INBOX,
} from '../../../src/modulos/canales/infraestructura/cola-eventos-entrantes-bullmq.js';
import { ProcesadorInbox } from '../../../src/modulos/canales/infraestructura/procesador-inbox.js';
import { RepositorioEventoEntrantePrisma } from '../../../src/modulos/canales/infraestructura/repositorio-evento-entrante-prisma.js';
import {
  CONSUMIDOR_EVENTOS_CANAL,
  type ConsumidorEventosCanal,
} from '../../../src/modulos/canales/puertos/consumidor-eventos-canal.js';
import { COLA_EVENTOS_ENTRANTES, type ColaEventosEntrantes } from '../../../src/modulos/canales/puertos/cola-eventos-entrantes.js';
import {
  REPOSITORIO_EVENTO_ENTRANTE,
  type RepositorioEventoEntrante,
} from '../../../src/modulos/canales/puertos/repositorio-evento-entrante.js';
import { ColasModule } from '../../../src/plataforma/colas/index.js';
import { CONFIGURACION, ConfiguracionModule, type Configuracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { RelojModule } from '../../../src/plataforma/reloj/index.js';
import { prefijoRedisDePrueba, urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_AUTH_DE_PRUEBA } from '../../soporte/configuracion-auth-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';

function eventoDePrueba(idMensaje: string): EventoCanal {
  return {
    v: 1,
    eventoProveedor: 'message_created',
    conversacion: { idExterno: '42', idContactoExterno: null, canal: 'whatsapp', canalProveedor: 'Channel::Whatsapp' },
    tipo: 'mensaje-entrante',
    idMensaje,
    tipoContenido: 'texto',
  };
}

/**
 * Arranca una app real (D6, D7: solo una app real dispara `onApplicationBootstrap`/
 * `beforeApplicationShutdown`, las fases de las que dependen PLT5 y el arranque del *worker*)
 * sobre Postgres + Redis reales de Testcontainers. `COLAS_PREFIJO` se aísla por
 * `VITEST_POOL_ID` (ADR-0009): primer test de esta fase que escribe claves de colas de verdad en
 * el contenedor Redis compartido entre archivos de test.
 */
async function crearAplicacion(configuracionParcial: Partial<Configuracion> = {}): Promise<INestApplication> {
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
    DEBOUNCE_MS: 3000,
    CONVERSACIONES_CONCURRENCIA: 10,
    CONVERSACIONES_BARRIDO_MS: 300000,
    HANDOFF_ESPERA_MIN: 30,
    ESPERA_CLIENTE_MIN: 10,
    ESPERA_CLIENTE_BARRIDO_MS: 60000,
    ...CONFIGURACION_AGENTE_DE_PRUEBA,
    ...CONFIGURACION_LLM_DE_PRUEBA,
    ...CONFIGURACION_AUTH_DE_PRUEBA,
    ...configuracionParcial,
  };

  const modulo = await Test.createTestingModule({
    imports: [
      ConfiguracionModule,
      RelojModule,
      PrismaModule,
      ColasModule,
      BullModule.registerQueue({ name: NOMBRE_COLA_INBOX }),
    ],
    providers: [
      { provide: REPOSITORIO_EVENTO_ENTRANTE, useClass: RepositorioEventoEntrantePrisma },
      { provide: COLA_EVENTOS_ENTRANTES, useClass: ColaEventosEntrantesBullmq },
      { provide: CONSUMIDOR_EVENTOS_CANAL, useClass: ConsumidorRegistrador },
      RegistroConsumidorEventosCanal,
      ProcesarEventoEntrante,
      ProcesadorInbox,
    ],
  })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba)
    .compile();

  const app = modulo.createNestApplication();
  await app.init();
  return app;
}

describe('Procesador del inbox (T4, integración, CAN4/R4/D6/D7)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('CAN4 — Un consumidor que falla siempre agota los reintentos con error e intentos visibles', async () => {
    // Dos intentos (en vez del default de 5) para que el backoff exponencial de BullMQ
    // (2 s, 4 s, ...) no alargue el test más de lo necesario.
    app = await crearAplicacion({ INBOX_MAX_INTENTOS: 2 });
    const prisma = app.get(PrismaService);
    const repositorio = app.get<RepositorioEventoEntrante>(REPOSITORIO_EVENTO_ENTRANTE);
    const cola = app.get<ColaEventosEntrantes>(COLA_EVENTOS_ENTRANTES);
    const registro = app.get(RegistroConsumidorEventosCanal);
    const consumidorQueSiempreFalla: ConsumidorEventosCanal = {
      consumir: () => {
        throw new Error('fallo simulado — este texto de cliente NUNCA debe llegar a `error` (R14)');
      },
    };
    registro.registrar(consumidorQueSiempreFalla);

    const resultado = await repositorio.registrar({
      origen: 'chatwoot',
      idExterno: 'mensaje:can4-1',
      payload: eventoDePrueba('can4-1'),
    });
    const { id } = resultado as { resultado: 'nuevo'; id: string };
    await cola.encolar(id);

    await vi.waitFor(
      async () => {
        const fila = await prisma.eventoEntrante.findUniqueOrThrow({ where: { id } });
        expect(fila.error).not.toBeNull();
      },
      { timeout: 15_000, interval: 250 },
    );

    const fila = await prisma.eventoEntrante.findUniqueOrThrow({ where: { id } });
    expect(fila.intentos).toBe(2);
    expect(fila.error).toBe('Error');
    expect(fila.error).not.toContain('fallo simulado');
    expect(fila.procesadoEn).toBeNull();
  });

  it('R4 — Reintento del proveedor sobre un evento entrante: el mismo evento se ejecuta una sola vez', async () => {
    app = await crearAplicacion();
    const prisma = app.get(PrismaService);
    const repositorio = app.get<RepositorioEventoEntrante>(REPOSITORIO_EVENTO_ENTRANTE);
    const cola = app.get<ColaEventosEntrantes>(COLA_EVENTOS_ENTRANTES);
    const registro = app.get(RegistroConsumidorEventosCanal);
    let llamadas = 0;
    const consumidorContador: ConsumidorEventosCanal = {
      consumir: () => {
        llamadas += 1;
        return Promise.resolve();
      },
    };
    registro.registrar(consumidorContador);

    const resultado = await repositorio.registrar({
      origen: 'chatwoot',
      idExterno: 'mensaje:r4-1',
      payload: eventoDePrueba('r4-1'),
    });
    const { id } = resultado as { resultado: 'nuevo'; id: string };

    // Mismo `jobId` (D5/D6): BullMQ ignora el segundo `add` — simula el proveedor reintentando el
    // mismo evento antes de que el primer job termine de procesarse.
    await cola.encolar(id);
    await cola.encolar(id);

    await vi.waitFor(
      async () => {
        const fila = await prisma.eventoEntrante.findUniqueOrThrow({ where: { id } });
        expect(fila.procesadoEn).not.toBeNull();
      },
      { timeout: 10_000, interval: 250 },
    );

    expect(llamadas).toBe(1);
  });
});
