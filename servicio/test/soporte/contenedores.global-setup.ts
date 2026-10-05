import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { S3Client, CreateBucketCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { MinioContainer, type StartedMinioContainer } from '@testcontainers/minio';
import { Client } from 'pg';
import { NOMBRE_BUCKET_PRUEBA, NOMBRE_PLANTILLA, urlConBase } from './bases-de-prueba.js';
import { ejecutarPrismaCli } from './prisma-cli.js';

declare module 'vitest' {
  export interface ProvidedContext {
    urlPostgresAdmin: string;
    urlRedisAdmin: string;
    urlMinioAdmin: string;
    minioAccessKeyId: string;
    minioSecretAccessKey: string;
  }
}

/** Región requerida por `S3Client`, ignorada por MinIO (D3, mismo criterio que `almacenamiento-minio.ts`). */
const REGION_S3_IGNORADA_POR_MINIO = 'us-east-1';

interface ContextoGlobalSetup {
  provide: <Clave extends keyof import('vitest').ProvidedContext>(
    clave: Clave,
    valor: import('vitest').ProvidedContext[Clave],
  ) => void;
}

/**
 * `globalSetup` de Vitest para los proyectos `integracion` y `e2e` (D1 de
 * `openspec/changes/fase-00a-esqueleto/design.md`; D6 de
 * `openspec/changes/fase-01-persistencia/design.md`): levanta Postgres 16 y Redis 7 reales con
 * Testcontainers una sola vez por corrida de cada proyecto, crea y migra la base **plantilla**
 * (`plantilla_luxe`) una sola vez, y expone la URL **de administración** de cada contenedor vía
 * `provide(...)`. `test/soporte/infraestructura.ts` es el único lugar donde un test lee esas URLs
 * (`inject(...)`); `test/soporte/base-por-worker.setup.ts` clona `plantilla_luxe` en
 * `test_<poolId>` antes de cada archivo de test.
 *
 * Con cero migraciones todavía (T1 de `fase-01-persistencia`), la plantilla queda creada pero sin
 * migrar: `prisma migrate deploy` se omite si `prisma/migrations/` no existe o está vacía.
 */
export default async function setup(
  contexto: ContextoGlobalSetup,
): Promise<() => Promise<void>> {
  const contenedorPostgres: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:16-alpine',
  ).start();
  const contenedorRedis: StartedRedisContainer = await new RedisContainer('redis:7-alpine').start();
  // Hallazgo real (T5, no anticipado por D9): `minio/minio` ya no existe en Docker Hub ("pull
  // access denied", confirmado en esta sesión) — MinIO restringió su distribución gratuita en 2025;
  // `quay.io/minio/minio` tampoco es accesible sin autenticación. `bitnamilegacy/minio` (imagen
  // congelada de Bitnami, gratuita, sin login) ejecuta el mismo binario `minio` con las mismas
  // variables `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` — mismo backend que `docker-compose.yml`.
  //
  // Segundo hallazgo real, propio de la imagen Bitnami: corre como usuario no-root `1001` (no
  // `root`, a diferencia de la imagen oficial) y solo tiene permiso de escritura sobre el volumen
  // que ella misma declara (`/bitnami/minio/data`), no sobre `/data` — el directorio que
  // `MinioContainer.start()` fija por defecto en su comando (confirmado con `FATAL Unable to
  // initialize backend: file access denied` contra `/data` en esta sesión). `withCommand(...)`
  // sobreescribe ese comando después de construir el contenedor, apuntando al volumen correcto.
  const contenedorMinio: StartedMinioContainer = await new MinioContainer('bitnamilegacy/minio:latest')
    .withUsername('luxe')
    .withPassword('luxeclave')
    .withCommand(['server', '--console-address', ':9001', '/bitnami/minio/data'])
    .start();

  const urlAdmin = contenedorPostgres.getConnectionUri();
  await crearYMigrarPlantilla(urlAdmin);
  await crearBucketDePrueba(contenedorMinio);

  contexto.provide('urlPostgresAdmin', urlAdmin);
  contexto.provide('urlRedisAdmin', contenedorRedis.getConnectionUrl());
  contexto.provide('urlMinioAdmin', contenedorMinio.getConnectionUrl());
  contexto.provide('minioAccessKeyId', contenedorMinio.getUsername());
  contexto.provide('minioSecretAccessKey', contenedorMinio.getPassword());

  return async () => {
    await Promise.all([contenedorPostgres.stop(), contenedorRedis.stop(), contenedorMinio.stop()]);
  };
}

/**
 * Crea (o confirma) el bucket de pruebas y le aplica una política de lectura pública, una sola vez
 * por corrida (D9, D3): el mismo criterio de "bucket público" que `AlmacenamientoMinio` asume en
 * producción, aplicado aquí desde el arnés de pruebas (nunca desde código de `src/`) para que
 * `MED1 — Obtener la URL de una clave guardada devuelve una URL utilizable` pueda de verdad
 * descargar el objeto por HTTP sin credenciales.
 */
async function crearBucketDePrueba(contenedorMinio: StartedMinioContainer): Promise<void> {
  const cliente = new S3Client({
    endpoint: contenedorMinio.getConnectionUrl(),
    region: REGION_S3_IGNORADA_POR_MINIO,
    credentials: {
      accessKeyId: contenedorMinio.getUsername(),
      secretAccessKey: contenedorMinio.getPassword(),
    },
    forcePathStyle: true,
  });

  try {
    await cliente.send(new CreateBucketCommand({ Bucket: NOMBRE_BUCKET_PRUEBA }));
  } catch (error) {
    const codigo = (error as { name?: string }).name;
    if (codigo !== 'BucketAlreadyOwnedByYou' && codigo !== 'BucketAlreadyExists') {
      throw error;
    }
  }

  await cliente.send(
    new PutBucketPolicyCommand({
      Bucket: NOMBRE_BUCKET_PRUEBA,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${NOMBRE_BUCKET_PRUEBA}/*`],
          },
        ],
      }),
    }),
  );
}

async function crearYMigrarPlantilla(urlAdmin: string): Promise<void> {
  const cliente = new Client({ connectionString: urlAdmin });
  await cliente.connect();
  try {
    await cliente.query(`DROP DATABASE IF EXISTS "${NOMBRE_PLANTILLA}" WITH (FORCE)`);
    await cliente.query(`CREATE DATABASE "${NOMBRE_PLANTILLA}" TEMPLATE "template0"`);
  } finally {
    await cliente.end();
  }

  if (!hayMigraciones()) {
    return;
  }

  const urlPlantilla = urlConBase(urlAdmin, NOMBRE_PLANTILLA);
  const resultado = await ejecutarPrismaCli(['migrate', 'deploy'], urlPlantilla);
  if (resultado.codigo !== 0) {
    throw new Error(
      `prisma migrate deploy sobre "${NOMBRE_PLANTILLA}" terminó con código ${resultado.codigo}:\n` +
        `${resultado.salida}\n${resultado.error}`,
    );
  }
}

function hayMigraciones(): boolean {
  const carpetaMigraciones = path.resolve(import.meta.dirname, '..', '..', 'prisma', 'migrations');
  return existsSync(carpetaMigraciones) && readdirSync(carpetaMigraciones).length > 0;
}
