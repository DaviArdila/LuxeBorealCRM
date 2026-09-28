import path from 'node:path';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { importarCatalogo } from '../../../scripts/importar-catalogo.js';
import { CONFIGURACION, ConfiguracionModule, type Configuracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { iniciarServidorFotosFixture, type ServidorFotosFixture } from '../../fixtures/catalogo/servidor-fotos.js';
import {
  bucketMinioDePrueba,
  credencialesMinioDePrueba,
  urlMinioDePrueba,
  urlPostgresDePrueba,
  urlRedisDePrueba,
} from '../../soporte/infraestructura.js';

/**
 * Comando `catalogo:importar` de punta a punta (T10, criterio de salida de la fase,
 * `docs/fases/README.md` fila 03): ejercita `scripts/importar-catalogo.ts` tal cual lo invoca
 * `npm run catalogo:importar`, contra Postgres, Redis y MinIO reales (Testcontainers) y un
 * servidor HTTP local que sirve las fotos del propio fixture — nunca Google Drive ni la red real
 * (`descargarFoto`, T6, siempre hace `fetch` HTTP).
 */
const RUTA_FIXTURES = path.join(import.meta.dirname, '../../fixtures/catalogo');
const REGION_S3_IGNORADA_POR_MINIO = 'us-east-1';

function configuracionDePrueba(): Configuracion {
  const url = new URL(urlMinioDePrueba());
  const { accessKeyId, secretAccessKey } = credencialesMinioDePrueba();
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'silent',
    DATABASE_URL: urlPostgresDePrueba(),
    REDIS_URL: urlRedisDePrueba(),
    HEALTH_TIMEOUT_MS: 1500,
    DOCS_HABILITADO: false,
    MINIO_ENDPOINT: url.hostname,
    MINIO_PUERTO: Number(url.port),
    MINIO_SSL: url.protocol === 'https:',
    MINIO_ACCESS_KEY: accessKeyId,
    MINIO_SECRET_KEY: secretAccessKey,
    MINIO_BUCKET: bucketMinioDePrueba(),
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
  };
}

const CLAVES_ENTORNO = [
  'NODE_ENV',
  'PORT',
  'LOG_LEVEL',
  'DATABASE_URL',
  'REDIS_URL',
  'HEALTH_TIMEOUT_MS',
  'DOCS_HABILITADO',
  'MINIO_ENDPOINT',
  'MINIO_PUERTO',
  'MINIO_SSL',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'MINIO_BUCKET',
  'MINIO_URL_PUBLICA',
  'CATALOGO_SHEET_ID',
] as const;

/**
 * `importarCatalogo` construye su propio contexto con `NestFactory.createApplicationContext`, cuyo
 * `ConfiguracionModule` lee `process.env` directamente (única lectura de `process.env`, PLT1) — a
 * diferencia del resto de tests de integración de esta fase, que sustituyen `CONFIGURACION` vía
 * `Test.createTestingModule`. Fijar estas variables aquí es el único modo de que ese contexto
 * apunte a la infraestructura real de este worker (mismo mecanismo que ya usa
 * `test/e2e/aplicacion.e2e-spec.ts` para su primer test, "importar app.module.js sin variables de
 * entorno no lanza al importar").
 */
function fijarVariablesDeEntorno(configuracion: Configuracion): () => void {
  const originales = Object.fromEntries(CLAVES_ENTORNO.map((clave) => [clave, process.env[clave]]));

  process.env.NODE_ENV = configuracion.NODE_ENV;
  process.env.PORT = String(configuracion.PORT);
  process.env.LOG_LEVEL = configuracion.LOG_LEVEL;
  process.env.DATABASE_URL = configuracion.DATABASE_URL;
  process.env.REDIS_URL = configuracion.REDIS_URL;
  process.env.HEALTH_TIMEOUT_MS = String(configuracion.HEALTH_TIMEOUT_MS);
  process.env.DOCS_HABILITADO = String(configuracion.DOCS_HABILITADO);
  process.env.MINIO_ENDPOINT = configuracion.MINIO_ENDPOINT;
  process.env.MINIO_PUERTO = String(configuracion.MINIO_PUERTO);
  process.env.MINIO_SSL = String(configuracion.MINIO_SSL);
  process.env.MINIO_ACCESS_KEY = configuracion.MINIO_ACCESS_KEY;
  process.env.MINIO_SECRET_KEY = configuracion.MINIO_SECRET_KEY;
  process.env.MINIO_BUCKET = configuracion.MINIO_BUCKET;
  delete process.env.MINIO_URL_PUBLICA;
  delete process.env.CATALOGO_SHEET_ID;

  return () => {
    for (const clave of CLAVES_ENTORNO) {
      const valorOriginal = originales[clave];
      if (valorOriginal === undefined) {
        delete process.env[clave];
      } else {
        process.env[clave] = valorOriginal;
      }
    }
  };
}

async function conPrismaDePrueba<T>(accion: (prisma: PrismaService) => Promise<T>): Promise<T> {
  const modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba())
    .compile();
  try {
    return await accion(modulo.get(PrismaService));
  } finally {
    await modulo.close();
  }
}

/** Geografía mínima (IMP9) para que `tarifas.csv`/`cobertura.csv` del fixture resuelvan a DANE. */
async function sembrarGeografiaMinima(): Promise<void> {
  await conPrismaDePrueba(async (prisma) => {
    const antioquia = await prisma.departamento.create({ data: { id: '05', nombre: 'ANTIOQUIA' } });
    await prisma.ciudad.create({ data: { id: '05001', departamentoId: antioquia.id, nombre: 'MEDELLÍN' } });
    await prisma.departamento.create({ data: { id: '91', nombre: 'AMAZONAS' } });
  });
}

function crearClienteMinioDePrueba(): S3Client {
  const { accessKeyId, secretAccessKey } = credencialesMinioDePrueba();
  return new S3Client({
    endpoint: urlMinioDePrueba(),
    region: REGION_S3_IGNORADA_POR_MINIO,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

async function existeObjetoMinio(cliente: S3Client, clave: string): Promise<boolean> {
  try {
    await cliente.send(new HeadObjectCommand({ Bucket: bucketMinioDePrueba(), Key: clave }));
    return true;
  } catch {
    return false;
  }
}

describe('Comando catalogo:importar de punta a punta (T10, criterio de salida de la fase)', () => {
  let servidorFotos: ServidorFotosFixture;
  let restaurarEntorno: (() => void) | undefined;

  beforeAll(async () => {
    servidorFotos = await iniciarServidorFotosFixture();
    await sembrarGeografiaMinima();
  }, 30_000);

  afterAll(async () => {
    await servidorFotos.cerrar();
  });

  afterEach(() => {
    restaurarEntorno?.();
    restaurarEntorno = undefined;
  });

  it('--solo-validar reporta un catálogo válido sin escribir nada', async () => {
    restaurarEntorno = fijarVariablesDeEntorno(configuracionDePrueba());

    const resultado = await importarCatalogo(['--dir', RUTA_FIXTURES, '--solo-validar']);

    expect(resultado.limpio).toBe(true);
    expect(resultado.mensaje).toContain('válido');
    await expect(conPrismaDePrueba((prisma) => prisma.producto.count())).resolves.toBe(0);
  });

  it('--dir deja productos, fotos y collage listos en MinIO, sin tocar la red real', async () => {
    restaurarEntorno = fijarVariablesDeEntorno(configuracionDePrueba());

    const resultado = await importarCatalogo(['--dir', RUTA_FIXTURES]);

    expect(resultado.limpio).toBe(true);
    expect(resultado.mensaje).toContain('importación completa');

    const productos = await conPrismaDePrueba((prisma) =>
      prisma.producto.findMany({ orderBy: { sku: 'asc' }, include: { fotos: true } }),
    );

    expect(productos).toHaveLength(2);
    const [producto1, producto2] = productos;
    expect(producto1?.sku).toBe('SKU-0001');
    expect(producto1?.fotos).toHaveLength(6);
    expect(producto1?.claveCollage).toBe('catalogo/SKU-0001/collage.jpg');
    expect(producto2?.sku).toBe('SKU-0002');
    expect(producto2?.fotos).toHaveLength(1);
    expect(producto2?.claveCollage).toBe('catalogo/SKU-0002/collage.jpg');

    await conPrismaDePrueba(async (prisma) => {
      await expect(prisma.tarifaEstimada.count()).resolves.toBe(2);
      await expect(prisma.zonaSinCobertura.count()).resolves.toBe(1);
      await expect(prisma.parametro.count()).resolves.toBe(3);
      await expect(prisma.excepcionHorario.count()).resolves.toBe(2);
    });

    const cliente = crearClienteMinioDePrueba();
    await expect(existeObjetoMinio(cliente, 'catalogo/SKU-0001/foto-1.jpg')).resolves.toBe(true);
    await expect(existeObjetoMinio(cliente, 'catalogo/SKU-0001/collage.jpg')).resolves.toBe(true);
    await expect(existeObjetoMinio(cliente, 'catalogo/SKU-0002/foto-1.jpg')).resolves.toBe(true);
  });
});
