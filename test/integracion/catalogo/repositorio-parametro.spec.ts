import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONFIGURACION,
  ConfiguracionModule,
  type Configuracion,
} from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { RepositorioParametroCatalogoPrisma } from '../../../src/modulos/catalogo/infraestructura/repositorio-parametro-prisma.js';
import type { RepositorioParametroCatalogo } from '../../../src/modulos/catalogo/puertos/repositorio-parametro.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../../soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../soporte/configuracion-llm-de-prueba.js';

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearRepositorio(): Promise<{ repositorio: RepositorioParametroCatalogo; prisma: PrismaService }> {
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
    ...CONFIGURACION_AGENTE_DE_PRUEBA,
    ...CONFIGURACION_LLM_DE_PRUEBA,
  };

  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba)
    .compile();

  const prisma = modulo.get(PrismaService);
  return { repositorio: new RepositorioParametroCatalogoPrisma(prisma), prisma };
}

describe('Repositorio de parámetro de catálogo (T5, integración)', () => {
  it('obtenerFactorVolumetrico lee el valor guardado en parametro', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    await prisma.parametro.upsert({
      where: { clave: 'factor_volumetrico' },
      create: { clave: 'factor_volumetrico', valor: 5000 },
      update: { valor: 5000 },
    });

    expect(await repositorio.obtenerFactorVolumetrico()).toBe(5000);
  });

  it('obtenerFactorVolumetrico sin el parámetro configurado asume el valor por defecto del dominio', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    await prisma.parametro.deleteMany({ where: { clave: 'factor_volumetrico' } });

    expect(await repositorio.obtenerFactorVolumetrico()).toBe(4000);
  });

  it('obtenerMensajeFueraCobertura lee el texto guardado en parametro', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    await prisma.parametro.upsert({
      where: { clave: 'mensaje_fuera_cobertura' },
      create: { clave: 'mensaje_fuera_cobertura', valor: 'Mensaje de prueba de cobertura' },
      update: { valor: 'Mensaje de prueba de cobertura' },
    });

    expect(await repositorio.obtenerMensajeFueraCobertura()).toBe('Mensaje de prueba de cobertura');
  });

  it('obtenerMensajeFueraCobertura sin el parámetro configurado asume un mensaje por defecto no vacío', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    await prisma.parametro.deleteMany({ where: { clave: 'mensaje_fuera_cobertura' } });

    const mensaje = await repositorio.obtenerMensajeFueraCobertura();

    expect(typeof mensaje).toBe('string');
    expect(mensaje.length).toBeGreaterThan(0);
    // CAT11: el texto por defecto no promete ningún contacto (eso depende de la Fase 08).
    expect(mensaje).not.toMatch(/asesor|contactar/i);
  });
});
