import { BullModule } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RegistroObservadoresEspera,
  type EventoEsperaCliente,
} from '../../../src/modulos/conversaciones/aplicacion/registro-observadores-espera.js';
import { ProcesarEsperasClientes } from '../../../src/modulos/conversaciones/aplicacion/procesar-esperas-clientes.js';
import {
  BarridoEsperas,
  NOMBRE_COLA_BARRIDO_ESPERAS,
} from '../../../src/modulos/conversaciones/infraestructura/colas/barrido-esperas.js';
import { RepositorioConversacionPrisma } from '../../../src/modulos/conversaciones/infraestructura/prisma/repositorio-conversacion-prisma.js';
import { MarcaEsperaClienteRedis } from '../../../src/modulos/conversaciones/infraestructura/redis/marca-espera-cliente-redis.js';
import { MARCA_ESPERA_CLIENTE, type MarcaEsperaCliente } from '../../../src/modulos/conversaciones/puertos/marca-espera-cliente.js';
import { REPOSITORIO_CONVERSACION } from '../../../src/modulos/conversaciones/puertos/repositorio-conversacion.js';
import { ColasModule } from '../../../src/plataforma/colas/index.js';
import { CONFIGURACION, ConfiguracionModule, type Configuracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { RedisModule } from '../../../src/plataforma/redis/index.js';
import { CLOCK, RelojModule } from '../../../src/plataforma/reloj/index.js';
import { ClockFalso } from '../../fakes/clock-falso.js';
import { prefijoRedisDePrueba, urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_AUTH_DE_PRUEBA } from '../../soporte/configuracion-auth-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';

// Escenarios NTF7 de `openspec/changes/fase-08d-avisos-con-enlace/specs/notificaciones/spec.md`, contra
// Postgres y Redis reales. Las claves de Redis cuelgan de `COLAS_PREFIJO`, aislado por worker: otro archivo de
// integración nunca ve ni barre las esperas de este.

const MIN = 60_000;
const T0 = new Date('2026-10-01T10:00:00Z');

async function crearContexto() {
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
    COLAS_TRABAJADORES: false, // el test llama ejecutarBarrido() directo, no necesita el worker real
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
  };

  const clock = new ClockFalso(T0);

  const modulo = await Test.createTestingModule({
    imports: [
      ConfiguracionModule,
      RelojModule,
      PrismaModule,
      RedisModule,
      ColasModule,
      BullModule.registerQueue({ name: NOMBRE_COLA_BARRIDO_ESPERAS }),
    ],
    providers: [
      { provide: REPOSITORIO_CONVERSACION, useClass: RepositorioConversacionPrisma },
      { provide: MARCA_ESPERA_CLIENTE, useClass: MarcaEsperaClienteRedis },
      RegistroObservadoresEspera,
      ProcesarEsperasClientes,
      BarridoEsperas,
    ],
  })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba)
    .overrideProvider(CLOCK)
    .useValue(clock)
    .compile();

  const app = modulo.createNestApplication();
  await app.init();

  const eventos: EventoEsperaCliente[] = [];
  app.get(RegistroObservadoresEspera).registrar({
    alEsperarCliente: (evento) => {
      eventos.push(evento);
      return Promise.resolve();
    },
  });

  const prisma = app.get(PrismaService);
  const marca = app.get<MarcaEsperaCliente>(MARCA_ESPERA_CLIENTE);
  const creadas: string[] = [];
  return {
    app,
    clock,
    eventos,
    prisma,
    barrido: app.get(BarridoEsperas),
    marca,
    /** Crea una conversación y la anota para limpiar su marca de Redis al terminar el test. */
    abrir: async (estado: 'bot' | 'humano' | 'handoff_pendiente') => {
      const id = await crearConversacion(prisma, estado);
      creadas.push(id);
      return id;
    },
    limpiar: async () => {
      for (const id of creadas) await marca.cerrar(id);
    },
  };
}

async function crearConversacion(
  prisma: PrismaService,
  estado: 'bot' | 'humano' | 'handoff_pendiente',
): Promise<string> {
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

describe('BarridoEsperas (T5, integración, NTF7, D5)', () => {
  let app: INestApplication | undefined;
  let limpiar: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await limpiar?.();
    limpiar = undefined;
    await app?.close();
    app = undefined;
  });

  it('NTF7 — un cliente en humano sin respuesta tras 11 minutos provoca un aviso con hace cuánto esperó', async () => {
    const contexto = await crearContexto();
    app = contexto.app;
    limpiar = contexto.limpiar;
    const id = await contexto.abrir('humano');
    await contexto.marca.registrar(id, T0);
    contexto.clock.avanzar(11 * MIN);

    await expect(contexto.barrido.ejecutarBarrido()).resolves.toBe(1);

    expect(contexto.eventos).toHaveLength(1);
    expect(contexto.eventos[0]).toMatchObject({ conversacionId: id, desde: T0, esperaMin: 11 });
  });

  it('NTF7 — antes de cumplirse el tiempo no se avisa', async () => {
    const contexto = await crearContexto();
    app = contexto.app;
    limpiar = contexto.limpiar;
    const id = await contexto.abrir('humano');
    await contexto.marca.registrar(id, T0);
    contexto.clock.avanzar(9 * MIN);

    await expect(contexto.barrido.ejecutarBarrido()).resolves.toBe(0);

    expect(contexto.eventos).toEqual([]);
  });

  it('NTF7 — una espera avisa una sola vez, aunque el barrido corra otra vez', async () => {
    const contexto = await crearContexto();
    app = contexto.app;
    limpiar = contexto.limpiar;
    const id = await contexto.abrir('handoff_pendiente');
    await contexto.marca.registrar(id, T0);
    contexto.clock.avanzar(11 * MIN);

    await contexto.barrido.ejecutarBarrido();
    contexto.clock.avanzar(5 * MIN);
    await contexto.barrido.ejecutarBarrido();

    expect(contexto.eventos).toHaveLength(1);
  });

  it('NTF7 — una conversación que ya volvió a bot no avisa y su espera se descarta', async () => {
    const contexto = await crearContexto();
    app = contexto.app;
    limpiar = contexto.limpiar;
    const id = await contexto.abrir('bot');
    await contexto.marca.registrar(id, T0);
    contexto.clock.avanzar(11 * MIN);

    await expect(contexto.barrido.ejecutarBarrido()).resolves.toBe(0);

    expect(contexto.eventos).toEqual([]);
    expect(await contexto.marca.vencidas(new Date(T0.getTime() + 60 * MIN), 100)).toEqual([]);
  });

  it('NTF7 — un fallo del barrido no lanza: se registra y el siguiente lo reintenta', async () => {
    const contexto = await crearContexto();
    app = contexto.app;
    limpiar = contexto.limpiar;
    const procesar = app.get(ProcesarEsperasClientes);
    procesar.ejecutar = () => Promise.reject(new Error('redis caído'));

    await expect(contexto.barrido.ejecutarBarrido()).resolves.toBe(0);
  });
});
