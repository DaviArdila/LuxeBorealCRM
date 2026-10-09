import { BullModule } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgenteEco } from '../../../src/modulos/conversaciones/aplicacion/agente-eco.js';
import { SALIDA_CANAL, type SalidaCanal, type SolicitudCambioEstado } from '../../../src/modulos/canales/index.js';
import { ProcesarTurno } from '../../../src/modulos/conversaciones/aplicacion/procesar-turno.js';
import { RegistroObservadoresHandoff } from '../../../src/modulos/conversaciones/aplicacion/registro-observadores-handoff.js';
import { RegistroObservadoresAviso } from '../../../src/modulos/conversaciones/aplicacion/registro-observadores-aviso.js';
import { MarcaAsesorAvisadoRedis } from '../../../src/modulos/conversaciones/infraestructura/redis/marca-asesor-avisado-redis.js';
import { MARCA_ASESOR_AVISADO } from '../../../src/modulos/conversaciones/puertos/marca-asesor-avisado.js';
import { TransicionarConversacion } from '../../../src/modulos/conversaciones/aplicacion/transicionar-conversacion.js';
import { MarcaEsperaClienteRedis } from '../../../src/modulos/conversaciones/infraestructura/redis/marca-espera-cliente-redis.js';
import { MARCA_ESPERA_CLIENTE } from '../../../src/modulos/conversaciones/puertos/marca-espera-cliente.js';
import { BufferTurno } from '../../../src/modulos/conversaciones/infraestructura/redis/buffer-turno.js';
import { LockTurno } from '../../../src/modulos/conversaciones/infraestructura/redis/lock-turno.js';
import { ColaTurno, NOMBRE_COLA_TURNO } from '../../../src/modulos/conversaciones/infraestructura/colas/cola-turno.js';
import { RepositorioConversacionPrisma } from '../../../src/modulos/conversaciones/infraestructura/prisma/repositorio-conversacion-prisma.js';
import {
  GENERADOR_RESPUESTA,
  type GeneradorRespuesta,
} from '../../../src/modulos/conversaciones/puertos/generador-respuesta.js';
import { REPOSITORIO_CONVERSACION } from '../../../src/modulos/conversaciones/puertos/repositorio-conversacion.js';
import {
  ENVIAR_RESPUESTA_TURNO,
  type EnviarRespuestaTurno,
  type PasoRespuesta,
} from '../../../src/modulos/conversaciones/puertos/salida-conversacion.js';
import { ColasModule } from '../../../src/plataforma/colas/index.js';
import { CONFIGURACION, ConfiguracionModule, type Configuracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { RedisModule } from '../../../src/plataforma/redis/index.js';
import { CLOCK, RelojModule, type Clock } from '../../../src/plataforma/reloj/index.js';
import { prefijoRedisDePrueba, urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_AUTH_DE_PRUEBA } from '../../soporte/configuracion-auth-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';

/** Doble en memoria de `EnviarRespuestaTurno`, registrado como provider real (T4: sin T6 todavía). */
class EnviarRespuestaTurnoDoble implements EnviarRespuestaTurno {
  llamadas: { idConversacion: string; idRespuesta: string; pasos: readonly PasoRespuesta[] }[] = [];

  enviar(idConversacion: string, idRespuesta: string, pasos: readonly PasoRespuesta[]): Promise<void> {
    this.llamadas.push({ idConversacion, idRespuesta, pasos });
    return Promise.resolve();
  }
}

/** Doble de `SALIDA_CANAL`: el espejo real por el outbox se prueba en `barrido-vencimientos.spec.ts`. */
class SalidaCanalDoble implements SalidaCanal {
  estados: SolicitudCambioEstado[] = [];

  enviarMensajes(): Promise<void> {
    return Promise.resolve();
  }

  cambiarEstado(solicitud: SolicitudCambioEstado): Promise<void> {
    this.estados.push(solicitud);
    return Promise.resolve();
  }

  agregarEtiquetas(): Promise<void> {
    return Promise.resolve();
  }
}

async function crearAplicacion(
  configuracionParcial: Partial<Configuracion> = {},
  generador?: GeneradorRespuesta,
): Promise<{ app: INestApplication; salida: EnviarRespuestaTurnoDoble; salidaCanal: SalidaCanalDoble }> {
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
    DEBOUNCE_MS: 500,
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

  const salida = new EnviarRespuestaTurnoDoble();
  const salidaCanal = new SalidaCanalDoble();

  const modulo = await Test.createTestingModule({
    imports: [
      ConfiguracionModule,
      RelojModule,
      PrismaModule,
      RedisModule,
      ColasModule,
      BullModule.registerQueue({ name: NOMBRE_COLA_TURNO }),
    ],
    providers: [
      { provide: REPOSITORIO_CONVERSACION, useClass: RepositorioConversacionPrisma },
      generador === undefined
        ? { provide: GENERADOR_RESPUESTA, useClass: AgenteEco }
        : { provide: GENERADOR_RESPUESTA, useValue: generador },
      { provide: ENVIAR_RESPUESTA_TURNO, useValue: salida },
      { provide: SALIDA_CANAL, useValue: salidaCanal },
      { provide: MARCA_ESPERA_CLIENTE, useClass: MarcaEsperaClienteRedis },
      TransicionarConversacion,
      BufferTurno,
      LockTurno,
      ProcesarTurno,
      RegistroObservadoresHandoff,
      RegistroObservadoresAviso,
      { provide: MARCA_ASESOR_AVISADO, useClass: MarcaAsesorAvisadoRedis },
      ColaTurno,
    ],
  })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba)
    .compile();

  const app = modulo.createNestApplication();
  await app.init();
  return { app, salida, salidaCanal };
}

async function crearConversacion(
  prisma: PrismaService,
  estado: 'bot' | 'humano' = 'bot',
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

describe('ProcesarTurno + ColaTurno (T4, integración, CNV1/CNV6/R8/D6/D7/D8)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('CNV1/CNV6 — cuatro mensajes en la ventana de debounce producen una sola invocación y el eco reenvía el último texto', async () => {
    const contexto = await crearAplicacion();
    app = contexto.app;
    const prisma = app.get(PrismaService);
    const buffer = app.get(BufferTurno);
    const colaTurno = app.get(ColaTurno);
    const idConv = await crearConversacion(prisma, 'bot');

    for (const texto of ['uno', 'dos', 'tres', 'cuatro']) {
      await buffer.push(idConv, JSON.stringify({ idMensaje: crypto.randomUUID(), tipoContenido: 'texto', texto }));
      await colaTurno.encolarConDebounce(idConv);
    }

    await vi.waitFor(
      () => {
        expect(contexto.salida.llamadas).toHaveLength(1);
      },
      { timeout: 10_000, interval: 100 },
    );

    expect(contexto.salida.llamadas[0].pasos).toEqual([{ paso: 'eco-1', tipo: 'texto', texto: 'cuatro' }]);
  });

  it('R8 — dos jobs de la misma conversación no producen dos respuestas', async () => {
    const contexto = await crearAplicacion({ DEBOUNCE_MS: 500 });
    app = contexto.app;
    const prisma = app.get(PrismaService);
    const buffer = app.get(BufferTurno);
    const procesarTurno = app.get(ProcesarTurno);
    const idConv = await crearConversacion(prisma, 'bot');
    await buffer.push(idConv, JSON.stringify({ idMensaje: crypto.randomUUID(), tipoContenido: 'texto', texto: 'hola' }));

    // Dos llamadas concurrentes a `ejecutar` sobre la misma conversación (simula dos jobs a la vez).
    const [primero, segundo] = await Promise.all([
      procesarTurno.ejecutar(idConv, 'job-a'),
      procesarTurno.ejecutar(idConv, 'job-b'),
    ]);

    const exitosos = [primero, segundo].filter((r) => !r.reencolar);
    expect(exitosos.length).toBeGreaterThanOrEqual(1);
    expect(contexto.salida.llamadas).toHaveLength(1);
  });

  it('CNV2 — estado humano: el turno no genera ninguna respuesta', async () => {
    const contexto = await crearAplicacion();
    app = contexto.app;
    const prisma = app.get(PrismaService);
    const buffer = app.get(BufferTurno);
    const colaTurno = app.get(ColaTurno);
    const idConv = await crearConversacion(prisma, 'humano');
    await buffer.push(idConv, JSON.stringify({ idMensaje: crypto.randomUUID(), tipoContenido: 'texto', texto: 'hola' }));

    await colaTurno.encolarConDebounce(idConv);
    await new Promise((resolve) => setTimeout(resolve, 1000)); // ventana de debounce + margen

    expect(contexto.salida.llamadas).toHaveLength(0);
  });

  it('CNV8 — El generador pide handoff y la conversación queda esperando a un asesor', async () => {
    const generador: GeneradorRespuesta = {
      generar: () =>
        Promise.resolve({
          pasos: [{ paso: 'p1', tipo: 'texto', texto: 'te paso con un asesor' }],
          handoff: { motivo: 'tope-turnos' },
        }),
    };
    const contexto = await crearAplicacion({ HANDOFF_TTL_MIN: 45 }, generador);
    app = contexto.app;
    const prisma = app.get(PrismaService);
    const buffer = app.get(BufferTurno);
    const procesarTurno = app.get(ProcesarTurno);
    const idConv = await crearConversacion(prisma, 'bot');
    await buffer.push(idConv, JSON.stringify({ idMensaje: crypto.randomUUID(), tipoContenido: 'audio', texto: '' }));
    const antes = app.get<Clock>(CLOCK).ahora().getTime();

    await procesarTurno.ejecutar(idConv, 'job-handoff');

    expect(contexto.salida.llamadas).toHaveLength(1);
    expect(contexto.salida.llamadas[0].pasos).toEqual([{ paso: 'p1', tipo: 'texto', texto: 'te paso con un asesor' }]);
    const fila = await prisma.conversacion.findUniqueOrThrow({ where: { id: idConv } });
    expect(fila.estado).toBe('handoff_pendiente');
    expect(fila.version).toBe(1);
    // El reloj es el del sistema en este arnés: la ventana es HANDOFF_TTL_MIN desde ahora (±1 min).
    const ventanaMs = (fila.expiraControlEn?.getTime() ?? 0) - antes;
    expect(ventanaMs).toBeGreaterThan(44 * 60_000);
    expect(ventanaMs).toBeLessThan(46 * 60_000);
    expect(contexto.salidaCanal.estados).toEqual([
      { idConversacion: String(fila.chatwootConversationId), idOperacion: 'espejo-v1', estado: 'abierta' },
    ]);
    expect(await buffer.tamano(idConv)).toBe(0);
  });
});
