import { BullModule } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { CanalesModule } from '../../../src/modulos/canales/index.js';
import { AgenteEco } from '../../../src/modulos/conversaciones/aplicacion/agente-eco.js';
import { TransicionarConversacion } from '../../../src/modulos/conversaciones/aplicacion/transicionar-conversacion.js';
import { MarcaAsesorAvisadoRedis } from '../../../src/modulos/conversaciones/infraestructura/redis/marca-asesor-avisado-redis.js';
import { MARCA_ASESOR_AVISADO } from '../../../src/modulos/conversaciones/puertos/marca-asesor-avisado.js';
import { MarcaEsperaClienteRedis } from '../../../src/modulos/conversaciones/infraestructura/redis/marca-espera-cliente-redis.js';
import { MARCA_ESPERA_CLIENTE } from '../../../src/modulos/conversaciones/puertos/marca-espera-cliente.js';
import {
  BarridoVencimientos,
  NOMBRE_COLA_BARRIDO_VENCIMIENTOS,
} from '../../../src/modulos/conversaciones/infraestructura/colas/barrido-vencimientos.js';
import { RepositorioConversacionPrisma } from '../../../src/modulos/conversaciones/infraestructura/prisma/repositorio-conversacion-prisma.js';
import { GENERADOR_RESPUESTA } from '../../../src/modulos/conversaciones/puertos/generador-respuesta.js';
import { REPOSITORIO_CONVERSACION } from '../../../src/modulos/conversaciones/puertos/repositorio-conversacion.js';
import {
  ENVIAR_RESPUESTA_TURNO,
  type EnviarRespuestaTurno as PuertoEnviarRespuestaTurno,
  type PasoRespuesta,
} from '../../../src/modulos/conversaciones/puertos/salida-conversacion.js';
import { ColasModule } from '../../../src/plataforma/colas/index.js';
import { CONFIGURACION, ConfiguracionModule, type Configuracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { RedisModule } from '../../../src/plataforma/redis/index.js';
import { CLOCK, RelojModule } from '../../../src/plataforma/reloj/index.js';
import { ClockFalso } from '../../fakes/clock-falso.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_AUTH_DE_PRUEBA } from '../../soporte/configuracion-auth-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';

class EnviarRespuestaTurnoEspia implements PuertoEnviarRespuestaTurno {
  llamadas: { idConversacion: string; idRespuesta: string; pasos: readonly PasoRespuesta[] }[] = [];

  enviar(idConversacion: string, idRespuesta: string, pasos: readonly PasoRespuesta[]): Promise<void> {
    this.llamadas.push({ idConversacion, idRespuesta, pasos });
    return Promise.resolve();
  }
}

async function crearContexto(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
  barrido: BarridoVencimientos;
  espia: EnviarRespuestaTurnoEspia;
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

  const clock = new ClockFalso(new Date('2026-09-28T12:00:00Z'));
  const espia = new EnviarRespuestaTurnoEspia();

  const modulo = await Test.createTestingModule({
    imports: [
      ConfiguracionModule,
      RelojModule,
      PrismaModule,
      RedisModule,
      ColasModule,
      CanalesModule, // SALIDA_CANAL real: el espejo de CNV8 queda en el outbox de Postgres
      BullModule.registerQueue({ name: NOMBRE_COLA_BARRIDO_VENCIMIENTOS }),
    ],
    providers: [
      { provide: REPOSITORIO_CONVERSACION, useClass: RepositorioConversacionPrisma },
      { provide: GENERADOR_RESPUESTA, useClass: AgenteEco },
      { provide: ENVIAR_RESPUESTA_TURNO, useValue: espia },
      { provide: MARCA_ESPERA_CLIENTE, useClass: MarcaEsperaClienteRedis },
      { provide: MARCA_ASESOR_AVISADO, useClass: MarcaAsesorAvisadoRedis },
      TransicionarConversacion,
      BarridoVencimientos,
    ],
  })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba)
    .overrideProvider(CLOCK)
    .useValue(clock)
    .compile();

  const app = modulo.createNestApplication();
  await app.init();

  return { app, prisma: app.get(PrismaService), barrido: app.get(BarridoVencimientos), espia };
}

async function crearConversacion(
  prisma: PrismaService,
  estado: 'humano' | 'handoff_pendiente',
  expiraControlEn: Date,
): Promise<string> {
  const contacto = await prisma.contacto.create({ data: {} });
  const conversacion = await prisma.conversacion.create({
    data: {
      contactoId: contacto.id,
      chatwootConversationId: Math.floor(Math.random() * 1_000_000_000),
      canal: 'whatsapp',
      estado,
      expiraControlEn,
    },
  });
  return conversacion.id;
}

describe('BarridoVencimientos (T7, integración, R7, D11)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('R7 — humano vence sin actividad del asesor', async () => {
    const contexto = await crearContexto();
    app = contexto.app;
    const idConv = await crearConversacion(contexto.prisma, 'humano', new Date('2026-09-28T11:00:00Z'));

    await contexto.barrido.ejecutarBarrido();

    const fila = await contexto.prisma.conversacion.findUniqueOrThrow({ where: { id: idConv } });
    expect(fila.estado).toBe('bot');
    expect(contexto.espia.llamadas).toHaveLength(0);
  });

  it('R7 — handoff_pendiente vence sin ser recogido', async () => {
    const contexto = await crearContexto();
    app = contexto.app;
    const idConv = await crearConversacion(
      contexto.prisma,
      'handoff_pendiente',
      new Date('2026-09-28T11:00:00Z'),
    );

    await contexto.barrido.ejecutarBarrido();

    const fila = await contexto.prisma.conversacion.findUniqueOrThrow({ where: { id: idConv } });
    expect(fila.estado).toBe('bot');
    expect(contexto.espia.llamadas).toHaveLength(0);
  });

  it('CNV8 — La vuelta al bot por vencimiento se espeja como pendiente', async () => {
    const contexto = await crearContexto();
    app = contexto.app;
    const idInterno = await crearConversacion(contexto.prisma, 'humano', new Date('2026-09-28T11:00:00Z'));
    const fila = await contexto.prisma.conversacion.findUniqueOrThrow({ where: { id: idInterno } });
    const idConv = String(fila.chatwootConversationId); // el espejo viaja con el id del canal

    await contexto.barrido.ejecutarBarrido();

    const filas = await contexto.prisma.outbox.findMany({
      where: { claveIdempotencia: { startsWith: `canal:estado:${idConv}:` } },
    });
    expect(filas).toHaveLength(1);
    expect(filas[0].claveIdempotencia).toBe(`canal:estado:${idConv}:espejo-v1`);
    expect(filas[0].tipo).toBe('canal.estado');
    expect(filas[0].payload).toMatchObject({ datos: { idConversacion: idConv, estado: 'pendiente' } });
    expect(filas[0].enviadoEn).toBeNull(); // encolado, no publicado: los trabajadores están apagados
  });

  it('una conversación aún no vencida no se toca', async () => {
    const contexto = await crearContexto();
    app = contexto.app;
    const idConv = await crearConversacion(contexto.prisma, 'humano', new Date('2026-09-28T13:00:00Z'));

    await contexto.barrido.ejecutarBarrido();

    const fila = await contexto.prisma.conversacion.findUniqueOrThrow({ where: { id: idConv } });
    expect(fila.estado).toBe('humano');
  });
});
