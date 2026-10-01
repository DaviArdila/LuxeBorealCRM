import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { BufferTurno } from '../../../src/modulos/conversaciones/infraestructura/redis/buffer-turno.js';
import { LockTurno } from '../../../src/modulos/conversaciones/infraestructura/redis/lock-turno.js';
import { ContadorRateLimit } from '../../../src/modulos/conversaciones/infraestructura/redis/contador-rate-limit.js';
import {
  InterruptorGlobalRedis,
} from '../../../src/modulos/conversaciones/infraestructura/redis/interruptor-global-redis.js';
import { MarcaEsperaClienteRedis } from '../../../src/modulos/conversaciones/infraestructura/redis/marca-espera-cliente-redis.js';
import { MarcaMensajeProcesado } from '../../../src/modulos/conversaciones/infraestructura/redis/marca-mensaje-procesado.js';
import {
  CONFIGURACION,
  ConfiguracionModule,
  type Configuracion,
} from '../../../src/plataforma/config/index.js';
import { REDIS_CLIENTE, RedisModule, type ClienteRedis } from '../../../src/plataforma/redis/index.js';
import { ClockFalso } from '../../fakes/clock-falso.js';
import { claveInterruptorDePrueba, urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';

/**
 * Desviación reportada respecto a `tasks.md` T3 (no silenciosa, skill `luxeboreal-fases` §5): el
 * comando de test que anota esa tarea (`npm test -- modulos/conversaciones/infraestructura/redis`)
 * correría bajo el proyecto `unit` de Vitest, que no levanta infraestructura real
 * (`vitest.config.ts`, proyecto `unit`: `sin infraestructura`). Estos cuatro *providers* hablan con
 * Redis real (D6/D7/D14 de `design.md`), así que sus tests viven aquí, en `test/integracion/`, con
 * `npm run test:integracion -- redis-turno` — mismo nivel que usan los demás adaptadores de Redis
 * del repositorio (`test/integracion/catalogo/cache-catalogo-redis.spec.ts`).
 */

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearContexto(): Promise<{
  buffer: BufferTurno;
  lock: LockTurno;
  contador: ContadorRateLimit;
  interruptor: InterruptorGlobalRedis;
  marcaMensajeProcesado: MarcaMensajeProcesado;
  marcaEspera: MarcaEsperaClienteRedis;
  prefijoColas: string;
  redis: ClienteRedis;
  clock: ClockFalso;
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
    COLAS_PREFIJO: 'luxe:colas',
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
  };

  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, RedisModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba)
    .compile();

  const clienteRedis = modulo.get<ClienteRedis>(REDIS_CLIENTE);
  const clock = new ClockFalso(new Date('2026-09-28T12:00:00Z'));

  return {
    buffer: new BufferTurno(clienteRedis),
    lock: new LockTurno(clienteRedis, configuracionDePrueba),
    contador: new ContadorRateLimit(clienteRedis, configuracionDePrueba, clock),
    // Clave propia por worker: la global `bot:activo` la comparten todos los archivos de integración.
    interruptor: new InterruptorGlobalRedis(clienteRedis, claveInterruptorDePrueba()),
    marcaMensajeProcesado: new MarcaMensajeProcesado(clienteRedis),
    marcaEspera: new MarcaEsperaClienteRedis(clienteRedis, configuracionDePrueba),
    prefijoColas: configuracionDePrueba.COLAS_PREFIJO,
    redis: clienteRedis,
    clock,
  };
}

function idDePrueba(): string {
  return crypto.randomUUID();
}

describe('BufferTurno (T3, integración, D6)', () => {
  it('push acumula en orden y leerYVaciar los devuelve y vacía atómicamente', async () => {
    const { buffer } = await crearContexto();
    const idConv = idDePrueba();

    await buffer.push(idConv, 'uno');
    await buffer.push(idConv, 'dos');
    await buffer.push(idConv, 'tres');
    expect(await buffer.tamano(idConv)).toBe(3);

    const leidos = await buffer.leerYVaciar(idConv);

    expect(leidos).toEqual(['uno', 'dos', 'tres']);
    expect(await buffer.tamano(idConv)).toBe(0);
  });

  it('vaciar deja el buffer en cero sin devolver su contenido', async () => {
    const { buffer } = await crearContexto();
    const idConv = idDePrueba();
    await buffer.push(idConv, 'uno');

    await buffer.vaciar(idConv);

    expect(await buffer.tamano(idConv)).toBe(0);
  });
});

describe('LockTurno (T3, integración, D7, R8)', () => {
  it('un segundo adquirir sobre la misma clave falla mientras el primero no libera', async () => {
    const { lock } = await crearContexto();
    const idConv = idDePrueba();

    const primero = await lock.adquirir(idConv);
    const segundo = await lock.adquirir(idConv);

    expect(primero).toBe(true);
    expect(segundo).toBe(false);
  });

  it('liberar permite que un adquirir posterior tenga éxito', async () => {
    const { lock } = await crearContexto();
    const idConv = idDePrueba();
    await lock.adquirir(idConv);

    await lock.liberar(idConv);
    const tercero = await lock.adquirir(idConv);

    expect(tercero).toBe(true);
  });
});

describe('ContadorRateLimit (T3, integración, R13)', () => {
  it('cuenta correctamente por hora y por día con el CLOCK inyectado', async () => {
    const { contador } = await crearContexto();
    const idContacto = idDePrueba();

    for (let i = 0; i < 20; i += 1) {
      expect(await contador.verificarLimite(idContacto)).toBe(true);
    }
    expect(await contador.verificarLimite(idContacto)).toBe(false); // 21º mensaje: supera RATE_LIMIT_POR_HORA=20
  });
});

describe('InterruptorGlobalRedis (T3, integración, D14, CNV4)', () => {
  it('con la clave ausente, el interruptor se asume activo', async () => {
    const { interruptor } = await crearContexto();

    expect(await interruptor.estaActivo()).toBe(true);
  });

  it('con la clave en "false", el interruptor está apagado', async () => {
    const { interruptor, redis: cliente } = await crearContexto();
    if (cliente.status !== 'ready') await cliente.connect();
    await cliente.set(claveInterruptorDePrueba(), 'false');

    expect(await interruptor.estaActivo()).toBe(false);

    await cliente.del(claveInterruptorDePrueba());
  });
});

describe('MarcaMensajeProcesado (judgment-day ronda 2, integración, ADR-0004)', () => {
  it('estaProcesado es false antes de marcar y true después de marcarSiEsPrimeraVez', async () => {
    const { marcaMensajeProcesado } = await crearContexto();
    const idMensaje = idDePrueba();

    expect(await marcaMensajeProcesado.estaProcesado(idMensaje)).toBe(false);

    await marcaMensajeProcesado.marcarSiEsPrimeraVez(idMensaje);

    expect(await marcaMensajeProcesado.estaProcesado(idMensaje)).toBe(true);
  });

  it('estaProcesado es una lectura pura: no crea la marca por sí sola', async () => {
    const { marcaMensajeProcesado } = await crearContexto();
    const idMensaje = idDePrueba();

    await marcaMensajeProcesado.estaProcesado(idMensaje);

    expect(await marcaMensajeProcesado.marcarSiEsPrimeraVez(idMensaje)).toBe(true); // seguía sin existir
  });
});

describe('MarcaEsperaClienteRedis (T4, integración, CNV12)', () => {
  const T0 = new Date('2026-10-01T10:00:00Z');
  const enMinutos = (minutos: number) => new Date(T0.getTime() + minutos * 60_000);

  it('CNV12 — el primer mensaje sin respuesta abre la espera y uno posterior no cambia su instante', async () => {
    const { marcaEspera } = await crearContexto();
    const id = idDePrueba();

    await marcaEspera.registrar(id, T0);
    await marcaEspera.registrar(id, enMinutos(3));

    const vencidas = await marcaEspera.vencidas(enMinutos(10), 100);
    expect(vencidas.filter((e) => e.conversacionId === id)).toEqual([{ conversacionId: id, desde: T0 }]);
  });

  it('CNV12 — cerrar borra la espera y deja abrir otra', async () => {
    const { marcaEspera } = await crearContexto();
    const id = idDePrueba();
    await marcaEspera.registrar(id, T0);

    await marcaEspera.cerrar(id);
    expect((await marcaEspera.vencidas(enMinutos(60), 100)).some((e) => e.conversacionId === id)).toBe(false);

    await marcaEspera.registrar(id, enMinutos(20));
    const otra = await marcaEspera.vencidas(enMinutos(60), 100);
    expect(otra.find((e) => e.conversacionId === id)?.desde).toEqual(enMinutos(20));
  });

  it('NTF7 — vencidas solo devuelve las que superaron el límite, de la más antigua a la más reciente', async () => {
    const { marcaEspera } = await crearContexto();
    const [antigua, intermedia, reciente] = [idDePrueba(), idDePrueba(), idDePrueba()];
    await marcaEspera.registrar(intermedia, enMinutos(4));
    await marcaEspera.registrar(reciente, enMinutos(9));
    await marcaEspera.registrar(antigua, T0);

    const resultado = (await marcaEspera.vencidas(enMinutos(5), 100)).filter((e) =>
      [antigua, intermedia, reciente].includes(e.conversacionId),
    );

    expect(resultado.map((e) => e.conversacionId)).toEqual([antigua, intermedia]);
  });

  it('NTF7 — vencidas respeta el máximo por barrido', async () => {
    const { marcaEspera } = await crearContexto();
    for (let i = 0; i < 4; i++) await marcaEspera.registrar(idDePrueba(), enMinutos(i));

    expect(await marcaEspera.vencidas(enMinutos(60), 2)).toHaveLength(2);
  });

  it('NTF7 — reclamarAviso es atómico: solo una de dos llamadas concurrentes avisa', async () => {
    const { marcaEspera } = await crearContexto();
    const id = idDePrueba();
    await marcaEspera.registrar(id, T0);

    const resultados = await Promise.all([marcaEspera.reclamarAviso(id), marcaEspera.reclamarAviso(id)]);

    expect(resultados.filter(Boolean)).toHaveLength(1);
    expect((await marcaEspera.vencidas(enMinutos(60), 100)).some((e) => e.conversacionId === id)).toBe(false);
  });

  it('NTF7 — una espera avisada no se reabre con un mensaje nuevo: no hay un segundo aviso', async () => {
    const { marcaEspera } = await crearContexto();
    const id = idDePrueba();
    await marcaEspera.registrar(id, T0);
    await marcaEspera.reclamarAviso(id);

    await marcaEspera.registrar(id, enMinutos(30));

    expect((await marcaEspera.vencidas(enMinutos(120), 100)).some((e) => e.conversacionId === id)).toBe(false);
  });

  it('NTF7 — cerrar tras el aviso permite que el cliente abra una espera nueva', async () => {
    const { marcaEspera } = await crearContexto();
    const id = idDePrueba();
    await marcaEspera.registrar(id, T0);
    await marcaEspera.reclamarAviso(id);

    await marcaEspera.cerrar(id);
    await marcaEspera.registrar(id, enMinutos(30));

    expect((await marcaEspera.vencidas(enMinutos(120), 100)).some((e) => e.conversacionId === id)).toBe(true);
  });

  it('NTF7 — devolverAviso deshace el reclamo: la espera vuelve con su instante y puede reclamarse otra vez', async () => {
    const { marcaEspera } = await crearContexto();
    const id = idDePrueba();
    await marcaEspera.registrar(id, T0);
    expect(await marcaEspera.reclamarAviso(id)).toBe(true);

    await marcaEspera.devolverAviso({ conversacionId: id, desde: T0 });

    const vencidas = await marcaEspera.vencidas(enMinutos(60), 100);
    expect(vencidas.find((e) => e.conversacionId === id)?.desde).toEqual(T0);
    expect(await marcaEspera.reclamarAviso(id)).toBe(true);
  });

  it('CNV12 — la marca no guarda el contenido: solo el id de la conversación y el instante', async () => {
    const { marcaEspera, redis, prefijoColas } = await crearContexto();
    const id = idDePrueba();
    await marcaEspera.registrar(id, T0);

    const miembros = await redis.zrange(`${prefijoColas}:espera-cliente:pendiente`, '0', '-1');

    expect(miembros).toContain(id);
    expect(miembros.every((miembro) => /^[0-9a-f-]{36}$/i.test(miembro))).toBe(true);
  });
});
