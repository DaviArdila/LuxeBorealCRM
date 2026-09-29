import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { RepositorioConversacionPrisma } from '../../../src/modulos/conversaciones/infraestructura/prisma/repositorio-conversacion-prisma.js';
import { TransicionarConversacion } from '../../../src/modulos/conversaciones/aplicacion/transicionar-conversacion.js';
import type { SalidaCanal } from '../../../src/modulos/canales/index.js';
import { TransicionInvalida } from '../../../src/modulos/conversaciones/dominio/maquina-estados.js';
import type { Conversacion } from '../../../src/modulos/conversaciones/puertos/repositorio-conversacion.js';
import {
  CONFIGURACION,
  ConfiguracionModule,
  type Configuracion,
} from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { ClockFalso } from '../../fakes/clock-falso.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';

let modulo: TestingModule | undefined;

/** Estas pruebas son de la máquina de estados (R6/R7): el espejo en el canal (CNV8) se prueba aparte. */
const salidaCanalNula: SalidaCanal = {
  enviarMensajes: () => Promise.resolve(),
  cambiarEstado: () => Promise.resolve(),
  agregarEtiquetas: () => Promise.resolve(),
};

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearContexto(): Promise<{
  repositorio: RepositorioConversacionPrisma;
  prisma: PrismaService;
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
    ...CONFIGURACION_LLM_DE_PRUEBA,
  };

  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba)
    .compile();

  const prisma = modulo.get(PrismaService);
  return { repositorio: new RepositorioConversacionPrisma(prisma), prisma, clock: new ClockFalso() };
}

async function crearConversacion(
  prisma: PrismaService,
  overrides: Partial<{ estado: 'bot' | 'handoff_pendiente' | 'humano' | 'pausado' }> = {},
): Promise<Conversacion> {
  const contacto = await prisma.contacto.create({ data: {} });
  const chatwootConversationId = Math.floor(Math.random() * 1_000_000_000);
  const fila = await prisma.conversacion.create({
    data: {
      contactoId: contacto.id,
      chatwootConversationId,
      canal: 'whatsapp',
      estado: overrides.estado ?? 'humano',
    },
  });
  return {
    id: fila.id,
    contactoId: fila.contactoId,
    chatwootConversationId: fila.chatwootConversationId,
    canal: fila.canal,
    estado: fila.estado,
    expiraControlEn: fila.expiraControlEn,
    version: fila.version,
  };
}

describe('TransicionarConversacion (T2, integración, D2/D3)', () => {
  it('R6 — Un origen no permitido no puede devolver la conversación a bot', async () => {
    const { repositorio, prisma, clock } = await crearContexto();
    const conversacion = await crearConversacion(prisma, { estado: 'humano' });
    const casoDeUso = new TransicionarConversacion(repositorio, clock, {
      HUMANO_TTL_HORAS: 3,
      HANDOFF_TTL_MIN: 45,
      LOCK_TURNO_TTL_S: 30,
      RATE_LIMIT_POR_HORA: 20,
      RATE_LIMIT_POR_DIA: 60,
      DEBOUNCE_MS: 3000,
      CONVERSACIONES_CONCURRENCIA: 10,
      CONVERSACIONES_BARRIDO_MS: 300000,
      HANDOFF_ESPERA_MIN: 30,
      ...CONFIGURACION_LLM_DE_PRUEBA,
    } as Configuracion, salidaCanalNula);

    await expect(casoDeUso.ejecutar(conversacion, 'bot', 'eco_humano')).rejects.toThrow(TransicionInvalida);
    const filaSinCambios = await prisma.conversacion.findUniqueOrThrow({ where: { id: conversacion.id } });
    expect(filaSinCambios.estado).toBe('humano');
    expect(filaSinCambios.version).toBe(0);
  });

  it('R6 — Un origen no permitido no puede llevar la conversación a pausado', async () => {
    const { repositorio, prisma, clock } = await crearContexto();
    const conversacion = await crearConversacion(prisma, { estado: 'bot' });
    const casoDeUso = new TransicionarConversacion(repositorio, clock, {
      HUMANO_TTL_HORAS: 3,
      HANDOFF_TTL_MIN: 45,
      LOCK_TURNO_TTL_S: 30,
      RATE_LIMIT_POR_HORA: 20,
      RATE_LIMIT_POR_DIA: 60,
      DEBOUNCE_MS: 3000,
      CONVERSACIONES_CONCURRENCIA: 10,
      CONVERSACIONES_BARRIDO_MS: 300000,
      HANDOFF_ESPERA_MIN: 30,
      ...CONFIGURACION_LLM_DE_PRUEBA,
    } as Configuracion, salidaCanalNula);

    await expect(casoDeUso.ejecutar(conversacion, 'pausado', 'eco_humano')).rejects.toThrow(TransicionInvalida);
    const filaSinCambios = await prisma.conversacion.findUniqueOrThrow({ where: { id: conversacion.id } });
    expect(filaSinCambios.estado).toBe('bot');
    expect(filaSinCambios.version).toBe(0);
  });

  it('R6 — Un origen permitido devuelve la conversación a bot', async () => {
    const { repositorio, prisma, clock } = await crearContexto();
    const conversacion = await crearConversacion(prisma, { estado: 'humano' });
    const casoDeUso = new TransicionarConversacion(repositorio, clock, {
      HUMANO_TTL_HORAS: 3,
      HANDOFF_TTL_MIN: 45,
      LOCK_TURNO_TTL_S: 30,
      RATE_LIMIT_POR_HORA: 20,
      RATE_LIMIT_POR_DIA: 60,
      DEBOUNCE_MS: 3000,
      CONVERSACIONES_CONCURRENCIA: 10,
      CONVERSACIONES_BARRIDO_MS: 300000,
      HANDOFF_ESPERA_MIN: 30,
      ...CONFIGURACION_LLM_DE_PRUEBA,
    } as Configuracion, salidaCanalNula);

    const resultado = await casoDeUso.ejecutar(conversacion, 'bot', 'chatwoot_resolved');

    expect(resultado.estado).toBe('bot');
    const filaActualizada = await prisma.conversacion.findUniqueOrThrow({ where: { id: conversacion.id } });
    expect(filaActualizada.estado).toBe('bot');
    expect(filaActualizada.version).toBe(1);
  });

  it('R7 — Un mensaje del asesor renueva la ventana de humano', async () => {
    const { repositorio, prisma, clock } = await crearContexto();
    clock.fijar(new Date('2026-09-28T12:00:00Z'));
    const conversacion = await crearConversacion(prisma, { estado: 'humano' });
    const casoDeUso = new TransicionarConversacion(repositorio, clock, {
      HUMANO_TTL_HORAS: 3,
      HANDOFF_TTL_MIN: 45,
      LOCK_TURNO_TTL_S: 30,
      RATE_LIMIT_POR_HORA: 20,
      RATE_LIMIT_POR_DIA: 60,
      DEBOUNCE_MS: 3000,
      CONVERSACIONES_CONCURRENCIA: 10,
      CONVERSACIONES_BARRIDO_MS: 300000,
      HANDOFF_ESPERA_MIN: 30,
      ...CONFIGURACION_LLM_DE_PRUEBA,
    } as Configuracion, salidaCanalNula);

    const primerEco = await casoDeUso.ejecutar(conversacion, 'humano', 'eco_humano');
    expect(primerEco.expiraControlEn).toEqual(new Date('2026-09-28T15:00:00Z'));

    clock.avanzar(60 * 60 * 1000); // +1 h
    const segundoEco = await casoDeUso.ejecutar(primerEco, 'humano', 'eco_humano');

    expect(segundoEco.expiraControlEn).toEqual(new Date('2026-09-28T16:00:00Z'));
    expect(segundoEco.version).toBe(2);
  });
});
