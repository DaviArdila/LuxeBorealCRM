import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONFIGURACION,
  ConfiguracionModule,
  type Configuracion,
} from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { RepositorioProductoPrisma } from '../../../src/modulos/catalogo/infraestructura/repositorio-producto-prisma.js';
import type { RepositorioProducto } from '../../../src/modulos/catalogo/puertos/repositorio-producto.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearRepositorio(): Promise<RepositorioProducto> {
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
  };

  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba)
    .compile();

  const prisma = modulo.get(PrismaService);
  return new RepositorioProductoPrisma(prisma);
}

async function crearProducto(
  prisma: PrismaService,
  overrides: Partial<{
    sku: string;
    nombre: string;
    activo: boolean;
    conFoto: boolean;
  }> = {},
) {
  const sufijo = crypto.randomUUID().slice(0, 8);
  return prisma.producto.create({
    data: {
      sku: overrides.sku ?? `SKU-${sufijo}`,
      nombre: overrides.nombre ?? `Producto ${sufijo}`,
      descripcionCorta: 'Descripción corta',
      descripcionLarga: 'Descripción larga',
      precioCop: 50000,
      activo: overrides.activo ?? true,
      ...(overrides.conFoto
        ? { fotos: { create: [{ orden: 0, claveArchivo: `foto-${sufijo}.jpg` }] } }
        : {}),
    },
  });
}

describe('Repositorio de producto (T5, integración)', () => {
  it('listarActivosResumen devuelve solo productos activos ordenados por nombre', async () => {
    const repositorio = await crearRepositorio();
    const prisma = modulo!.get(PrismaService);

    await crearProducto(prisma, { nombre: 'Zeta activo', activo: true });
    await crearProducto(prisma, { nombre: 'Alfa activo', activo: true });
    const inactivo = await crearProducto(prisma, { nombre: 'Beta inactivo', activo: false });

    const resumen = await repositorio.listarActivosResumen();
    const nombres = resumen.map((p) => p.nombre);

    expect(nombres.indexOf('Alfa activo')).toBeLessThan(nombres.indexOf('Zeta activo'));
    expect(resumen.some((p) => p.id === inactivo.id)).toBe(false);
  });

  it('buscarPorIdOSku encuentra el producto por su id', async () => {
    const repositorio = await crearRepositorio();
    const prisma = modulo!.get(PrismaService);
    const creado = await crearProducto(prisma, { conFoto: true });

    const encontrado = await repositorio.buscarPorIdOSku(creado.id);

    expect(encontrado?.id).toBe(creado.id);
    expect(encontrado?.tieneFotos).toBe(true);
  });

  it('buscarPorIdOSku encuentra el producto por su sku', async () => {
    const repositorio = await crearRepositorio();
    const prisma = modulo!.get(PrismaService);
    const creado = await crearProducto(prisma, { sku: `SKU-BUSQUEDA-${crypto.randomUUID().slice(0, 8)}` });

    const encontrado = await repositorio.buscarPorIdOSku(creado.sku);

    expect(encontrado?.id).toBe(creado.id);
    expect(encontrado?.tieneFotos).toBe(false);
  });

  it('buscarPorIdOSku devuelve null si no existe ni como id ni como sku', async () => {
    const repositorio = await crearRepositorio();

    const encontrado = await repositorio.buscarPorIdOSku('no-existe-ningun-producto-con-este-sku');

    expect(encontrado).toBeNull();
  });
});
