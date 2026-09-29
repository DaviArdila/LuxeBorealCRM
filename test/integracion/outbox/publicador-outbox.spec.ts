import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ColasModule } from '../../../src/plataforma/colas/index.js';
import { CONFIGURACION, ConfiguracionModule, type Configuracion } from '../../../src/plataforma/config/index.js';
import { CLOCK, RelojModule } from '../../../src/plataforma/reloj/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import {
  FalloPublicacion,
  OutboxModule,
  PublicadorOutbox,
  REGISTRO_OUTBOX,
  RegistroManejadoresOutbox,
  type EntradaOutbox,
  type ManejadorOutbox,
  type NuevaEntradaOutbox,
  type RegistroOutbox,
} from '../../../src/plataforma/outbox/index.js';
import { ClockFalso } from '../../fakes/clock-falso.js';
import { prefijoRedisDePrueba, urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';

function entradaDePrueba(overrides: Partial<NuevaEntradaOutbox> = {}): NuevaEntradaOutbox {
  return {
    tipo: 'tipo.prueba',
    claveIdempotencia: `clave-${randomUUID()}`,
    grupo: `grupo-${randomUUID()}`,
    orden: 0,
    datos: {},
    ...overrides,
  };
}

class ManejadorDePrueba implements ManejadorOutbox {
  readonly llamadas: EntradaOutbox[] = [];

  constructor(
    private readonly comportamiento: (entrada: EntradaOutbox) => void | Promise<void> = () => undefined,
  ) {}

  async publicar(entrada: EntradaOutbox): Promise<void> {
    this.llamadas.push(entrada);
    await this.comportamiento(entrada);
  }
}

/**
 * Arranca una app real de plataforma (sin `canales`, T6 es genérico) sobre Postgres + Redis reales
 * de Testcontainers, con un `ClockFalso` inyectado para controlar el *lease* y el backoff sin
 * depender del reloj de pared. `COLAS_TRABAJADORES: false` (D6): esta suite llama
 * `PublicadorOutbox.publicarPendientes()` directamente, sin necesitar que el *worker* de BullMQ
 * consuma el job de disparo.
 */
async function crearAplicacion(
  configuracionParcial: Partial<Configuracion> = {},
): Promise<{ app: INestApplication; clock: ClockFalso }> {
  // Muy por delante del reloj de pared real: el default `now()` de Postgres para
  // `proximo_intento` (D10) MUST quedar en el pasado respecto al `ClockFalso` inyectado, o el
  // reclamo nunca vería lista una fila recién insertada.
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
    ...CONFIGURACION_AGENTE_DE_PRUEBA,
    ...CONFIGURACION_LLM_DE_PRUEBA,
    ...configuracionParcial,
  };

  const modulo = await Test.createTestingModule({
    imports: [ConfiguracionModule, RelojModule, PrismaModule, ColasModule, OutboxModule],
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

describe('Outbox genérico (T6, integración, D10/D11/D12)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('un predecesor pendiente bloquea a su sucesor del mismo grupo', async () => {
    const arrancado = await crearAplicacion();
    app = arrancado.app;
    const { clock } = arrancado;
    const registroOutbox = app.get<RegistroOutbox>(REGISTRO_OUTBOX);
    const registro = app.get(RegistroManejadoresOutbox);
    const publicador = app.get(PublicadorOutbox);

    const grupo = `grupo-${randomUUID()}`;
    let fallarPrimera = true;
    const manejador = new ManejadorDePrueba((entrada) => {
      if (fallarPrimera && entrada.orden === 0) {
        throw new FalloPublicacion('transitorio', 'fallo simulado');
      }
    });
    registro.registrar('tipo.prueba', manejador);

    await registroOutbox.agregar([
      entradaDePrueba({ claveIdempotencia: 'clave-a', grupo, orden: 0 }),
      entradaDePrueba({ claveIdempotencia: 'clave-b', grupo, orden: 1 }),
    ]);

    await publicador.publicarPendientes();

    // La segunda nunca se intenta mientras la primera siga pendiente (D10): ni una llamada de más.
    expect(manejador.llamadas.map((e) => e.claveIdempotencia)).toEqual(['clave-a']);

    clock.avanzar(15_000); // backoff del 1.º fallo transitorio: 15 s (D12)
    fallarPrimera = false;
    await publicador.publicarPendientes();

    expect(manejador.llamadas.map((e) => e.claveIdempotencia)).toEqual(['clave-a', 'clave-a', 'clave-b']);
  });

  it('dos publicadores concurrentes no publican la misma fila dos veces (FOR UPDATE SKIP LOCKED)', async () => {
    const arrancado = await crearAplicacion();
    app = arrancado.app;
    const registroOutbox = app.get<RegistroOutbox>(REGISTRO_OUTBOX);
    const registro = app.get(RegistroManejadoresOutbox);
    const publicador = app.get(PublicadorOutbox);

    const manejador = new ManejadorDePrueba(async () => {
      // Ensancha la ventana de carrera para que ambas llamadas concurrentes se solapen de verdad.
      await new Promise((resolver) => setTimeout(resolver, 100));
    });
    registro.registrar('tipo.prueba', manejador);

    await registroOutbox.agregar([entradaDePrueba({ claveIdempotencia: 'clave-unica' })]);

    await Promise.all([publicador.publicarPendientes(), publicador.publicarPendientes()]);

    expect(manejador.llamadas.map((e) => e.claveIdempotencia)).toEqual(['clave-unica']);
  });

  it('una fila con lease vencido vuelve a estar disponible para otro reclamo', async () => {
    const arrancado = await crearAplicacion({ OUTBOX_LEASE_S: 60 });
    app = arrancado.app;
    const { clock } = arrancado;
    const registroOutbox = app.get<RegistroOutbox>(REGISTRO_OUTBOX);
    const registro = app.get(RegistroManejadoresOutbox);
    const publicador = app.get(PublicadorOutbox);
    const prisma = app.get(PrismaService);

    const clave = `clave-${randomUUID()}`;
    await registroOutbox.agregar([entradaDePrueba({ claveIdempotencia: clave })]);

    // Simula un proceso que reclamó la fila (intentos=1, lease de 60 s) y murió sin publicar ni
    // marcar nada, en vez de colgar de verdad un manejador dentro del test.
    const filaReclamada = await prisma.outbox.findFirstOrThrow({ where: { claveIdempotencia: clave } });
    await prisma.outbox.update({
      where: { id: filaReclamada.id },
      data: { intentos: 1, proximoIntento: new Date(clock.ahora().getTime() + 60_000) },
    });

    const manejador = new ManejadorDePrueba();
    registro.registrar('tipo.prueba', manejador);

    await publicador.publicarPendientes();
    expect(manejador.llamadas).toHaveLength(0);

    clock.avanzar(61_000);
    await publicador.publicarPendientes();

    expect(manejador.llamadas).toHaveLength(1);
    expect(manejador.llamadas[0]?.intento).toBe(2);
  });

  it('efimero desaparece al cerrar la fila, tanto enviada como muerta', async () => {
    const arrancado = await crearAplicacion();
    app = arrancado.app;
    const registroOutbox = app.get<RegistroOutbox>(REGISTRO_OUTBOX);
    const registro = app.get(RegistroManejadoresOutbox);
    const publicador = app.get(PublicadorOutbox);
    const prisma = app.get(PrismaService);

    registro.registrar('tipo.exito', new ManejadorDePrueba());
    registro.registrar(
      'tipo.muere',
      new ManejadorDePrueba(() => {
        throw new FalloPublicacion('permanente', 'fallo definitivo');
      }),
    );

    const claveExito = `clave-${randomUUID()}`;
    const claveMuere = `clave-${randomUUID()}`;
    await registroOutbox.agregar([
      entradaDePrueba({ tipo: 'tipo.exito', claveIdempotencia: claveExito, efimero: { texto: 'secreto-exito' } }),
      entradaDePrueba({ tipo: 'tipo.muere', claveIdempotencia: claveMuere, efimero: { texto: 'secreto-muere' } }),
    ]);

    await publicador.publicarPendientes();

    const filaExito = await prisma.outbox.findUniqueOrThrow({ where: { claveIdempotencia: claveExito } });
    const filaMuere = await prisma.outbox.findUniqueOrThrow({ where: { claveIdempotencia: claveMuere } });

    expect(filaExito.enviadoEn).not.toBeNull();
    expect(filaExito.payload).not.toHaveProperty('efimero');
    expect(filaMuere.error).toBe('permanente: fallo definitivo');
    expect(filaMuere.payload).not.toHaveProperty('efimero');
  });

  it('agota los intentos y marca error "agotado: <causa>" sin dejar la fila pendiente para siempre', async () => {
    const arrancado = await crearAplicacion({
      OUTBOX_MAX_INTENTOS: 2,
      OUTBOX_BACKOFF_BASE_S: 1,
      OUTBOX_BACKOFF_MAX_S: 1,
    });
    app = arrancado.app;
    const { clock } = arrancado;
    const registroOutbox = app.get<RegistroOutbox>(REGISTRO_OUTBOX);
    const registro = app.get(RegistroManejadoresOutbox);
    const publicador = app.get(PublicadorOutbox);
    const prisma = app.get(PrismaService);

    registro.registrar(
      'tipo.prueba',
      new ManejadorDePrueba(() => {
        throw new FalloPublicacion('transitorio', 'siempre falla');
      }),
    );

    const clave = `clave-${randomUUID()}`;
    await registroOutbox.agregar([entradaDePrueba({ claveIdempotencia: clave })]);

    await publicador.publicarPendientes();
    let fila = await prisma.outbox.findUniqueOrThrow({ where: { claveIdempotencia: clave } });
    expect(fila.error).toBeNull();
    expect(fila.intentos).toBe(1);

    clock.avanzar(2_000);
    await publicador.publicarPendientes();

    fila = await prisma.outbox.findUniqueOrThrow({ where: { claveIdempotencia: clave } });
    expect(fila.error).toBe('agotado: siempre falla');
    expect(fila.enviadoEn).toBeNull();
    expect(fila.intentos).toBe(2);
  });

  it('un fallo permanente marca la fila muerta y aborta las filas pendientes de la misma secuencia (D10)', async () => {
    const arrancado = await crearAplicacion();
    app = arrancado.app;
    const registroOutbox = app.get<RegistroOutbox>(REGISTRO_OUTBOX);
    const registro = app.get(RegistroManejadoresOutbox);
    const publicador = app.get(PublicadorOutbox);
    const prisma = app.get(PrismaService);

    const grupo = `grupo-${randomUUID()}`;
    const secuencia = `secuencia-${randomUUID()}`;
    registro.registrar(
      'tipo.prueba',
      new ManejadorDePrueba((entrada) => {
        if (entrada.orden === 0) {
          throw new FalloPublicacion('permanente', 'rechazado');
        }
      }),
    );

    await registroOutbox.agregar([
      entradaDePrueba({ claveIdempotencia: 'c1', grupo, orden: 0, datos: { secuencia } }),
      entradaDePrueba({ claveIdempotencia: 'c2', grupo, orden: 1, datos: { secuencia } }),
      entradaDePrueba({ claveIdempotencia: 'c3', grupo, orden: 2, datos: { secuencia } }),
    ]);

    await publicador.publicarPendientes();

    const filas = await prisma.outbox.findMany({
      where: { claveIdempotencia: { in: ['c1', 'c2', 'c3'] } },
    });
    const porClave = new Map(filas.map((fila) => [fila.claveIdempotencia, fila]));

    expect(porClave.get('c1')?.error).toBe('permanente: rechazado');
    expect(porClave.get('c2')?.error).toBe('secuencia abortada');
    expect(porClave.get('c3')?.error).toBe('secuencia abortada');
    expect(porClave.get('c2')?.enviadoEn).toBeNull();
  });

  it('una fila sin manejador registrado para su tipo muere con error "sin-manejador"', async () => {
    const arrancado = await crearAplicacion();
    app = arrancado.app;
    const registroOutbox = app.get<RegistroOutbox>(REGISTRO_OUTBOX);
    const publicador = app.get(PublicadorOutbox);
    const prisma = app.get(PrismaService);

    const clave = `clave-${randomUUID()}`;
    await registroOutbox.agregar([entradaDePrueba({ tipo: 'tipo.sin-manejador', claveIdempotencia: clave })]);

    await publicador.publicarPendientes();

    const fila = await prisma.outbox.findUniqueOrThrow({ where: { claveIdempotencia: clave } });
    expect(fila.error).toBe('sin-manejador');
  });

  it('un esperaSugeridaS (Retry-After) mayor que OUTBOX_BACKOFF_MAX_S se acota al máximo (D12)', async () => {
    const arrancado = await crearAplicacion({ OUTBOX_BACKOFF_BASE_S: 15, OUTBOX_BACKOFF_MAX_S: 300 });
    app = arrancado.app;
    const { clock } = arrancado;
    const registroOutbox = app.get<RegistroOutbox>(REGISTRO_OUTBOX);
    const registro = app.get(RegistroManejadoresOutbox);
    const publicador = app.get(PublicadorOutbox);
    const prisma = app.get(PrismaService);

    registro.registrar(
      'tipo.prueba',
      new ManejadorDePrueba(() => {
        // Retry-After absurdamente grande, como podría enviar cualquier API ante un 429.
        throw new FalloPublicacion('transitorio', 'limite de tasa', 999_999);
      }),
    );

    const clave = `clave-${randomUUID()}`;
    await registroOutbox.agregar([entradaDePrueba({ claveIdempotencia: clave })]);

    await publicador.publicarPendientes();

    const fila = await prisma.outbox.findUniqueOrThrow({ where: { claveIdempotencia: clave } });
    const esperaRealS = (fila.proximoIntento.getTime() - clock.ahora().getTime()) / 1000;
    expect(esperaRealS).toBeLessThanOrEqual(300);
  });

  it('agregar la misma clave_idempotencia dos veces no duplica la fila (D11, ON CONFLICT DO NOTHING)', async () => {
    const arrancado = await crearAplicacion();
    app = arrancado.app;
    const registroOutbox = app.get<RegistroOutbox>(REGISTRO_OUTBOX);
    const prisma = app.get(PrismaService);

    const clave = `clave-${randomUUID()}`;
    await registroOutbox.agregar([entradaDePrueba({ claveIdempotencia: clave })]);
    await registroOutbox.agregar([entradaDePrueba({ claveIdempotencia: clave })]);

    const filas = await prisma.outbox.findMany({ where: { claveIdempotencia: clave } });
    expect(filas).toHaveLength(1);
  });
});
