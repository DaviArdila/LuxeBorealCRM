import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONFIGURACION,
  ConfiguracionModule,
  type Configuracion,
} from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { RepositorioPoliticaPrisma } from '../../../src/modulos/catalogo/infraestructura/repositorio-politica-prisma.js';
import type { RepositorioPolitica } from '../../../src/modulos/catalogo/puertos/repositorio-politica.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_AUTH_DE_PRUEBA } from '../../soporte/configuracion-auth-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearRepositorio(): Promise<{ repositorio: RepositorioPolitica; prisma: PrismaService }> {
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
    ...CONFIGURACION_AUTH_DE_PRUEBA,
  };

  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba)
    .compile();

  const prisma = modulo.get(PrismaService);
  return { repositorio: new RepositorioPoliticaPrisma(prisma), prisma };
}

async function fijar(prisma: PrismaService, clave: string, valor: string): Promise<void> {
  await prisma.parametro.upsert({ where: { clave }, create: { clave, valor }, update: { valor } });
}

describe('Repositorio de política (CAT12, integración)', () => {
  it('obtener lee el texto de politica_<tema> y devuelve null si no existe', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    await prisma.parametro.deleteMany({ where: { clave: { startsWith: 'politica_' } } });
    await fijar(prisma, 'politica_devoluciones', 'Texto de devoluciones');

    expect(await repositorio.obtener('devoluciones')).toBe('Texto de devoluciones');
    expect(await repositorio.obtener('garantia')).toBeNull();
  });

  it('obtener ignora una fila politica_ cuyo valor no es un texto no vacío', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    await prisma.parametro.deleteMany({ where: { clave: { startsWith: 'politica_' } } });
    await prisma.parametro.create({ data: { clave: 'politica_rota', valor: 5 } });

    expect(await repositorio.obtener('rota')).toBeNull();
    expect(await repositorio.listarTemas()).not.toContain('rota');
  });

  it('listarTemas devuelve los temas de las filas politica_ y no otras claves', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    await prisma.parametro.deleteMany({ where: { clave: { startsWith: 'politica_' } } });
    await fijar(prisma, 'politica_devoluciones', 'a');
    await fijar(prisma, 'politica_garantia', 'b');
    await fijar(prisma, 'factor_volumetrico_x', 'c');

    expect([...(await repositorio.listarTemas())].sort()).toEqual(['devoluciones', 'garantia']);
  });
});
