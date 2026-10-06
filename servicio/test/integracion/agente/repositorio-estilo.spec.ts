import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { RepositorioEstiloPrisma } from '../../../src/modulos/agente/infraestructura/prisma/repositorio-estilo-prisma.js';
import { VersionEstiloRedis } from '../../../src/modulos/agente/infraestructura/redis/version-estilo-redis.js';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { REDIS_CLIENTE, RedisModule, type ClienteRedis } from '../../../src/plataforma/redis/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

// Fase 08c, T2 / Fase 12, T3: lectura del estilo desde `version_estilo` (AGT18, EST-D1) y versión compartida en Redis
// (AGT19) contra Postgres y Redis reales.

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearContexto() {
  Logger.overrideLogger(false);
  const configuracion = cargarConfiguracion({
    NODE_ENV: 'test',
    DATABASE_URL: urlPostgresDePrueba(),
    REDIS_URL: urlRedisDePrueba(),
  });
  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule, RedisModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracion)
    .compile();
  const prisma = modulo.get(PrismaService);
  await prisma.versionEstilo.deleteMany();
  const redis = modulo.get<ClienteRedis>(REDIS_CLIENTE);
  if (redis.status === 'wait') await redis.connect();
  await redis.del('agente:prompt:version');
  return { repositorio: new RepositorioEstiloPrisma(prisma), version: new VersionEstiloRedis(redis), prisma, redis };
}

describe('RepositorioEstiloPrisma (Fase 08c, T2, integración)', () => {
  it('AGT18 — Un estilo publicado reemplaza al del archivo: lee el texto y su versión', async () => {
    const { repositorio, prisma } = await crearContexto();
    await prisma.versionEstilo.create({
      data: { version: 4, texto: 'Habla con mucha calidez.', vigente: true, publicadoEn: new Date('2026-10-01T10:00:00Z') },
    });

    await expect(repositorio.leerVigente()).resolves.toEqual({ texto: 'Habla con mucha calidez.', version: 4 });
  });

  it('AGT18 — Sin estilo publicado devuelve null (rige el archivo)', async () => {
    const { repositorio } = await crearContexto();

    await expect(repositorio.leerVigente()).resolves.toBeNull();
    await expect(repositorio.leerHistorial()).resolves.toEqual([]);
  });

  it('AGT18 — Un texto en blanco cae al respaldo', async () => {
    const { repositorio, prisma } = await crearContexto();
    await prisma.versionEstilo.create({
      data: { version: 1, texto: '   ', vigente: true, publicadoEn: new Date('2026-10-01T10:00:00Z') },
    });

    await expect(repositorio.leerVigente()).resolves.toBeNull();
  });

  it('EST-D3 — La versión vigente trae a quien la publicó', async () => {
    const { repositorio, prisma } = await crearContexto();
    const usuario = await prisma.usuario.create({
      data: { email: `estilo-${randomUUID()}@example.test`, nombre: 'Ana', passwordHash: 'hash-de-prueba', rol: 'admin' },
    });
    await prisma.versionEstilo.create({
      data: {
        version: 3,
        texto: 'Estilo de Ana.',
        vigente: true,
        publicadoEn: new Date('2026-10-01T10:00:00Z'),
        publicadoPorId: usuario.id,
        publicadoPorNombre: 'Ana',
      },
    });

    await expect(repositorio.leerVigente()).resolves.toEqual({
      texto: 'Estilo de Ana.',
      version: 3,
      publicadoPor: { id: usuario.id, nombre: 'Ana' },
    });
    await prisma.versionEstilo.deleteMany();
    await prisma.usuario.delete({ where: { id: usuario.id } });
  });
});

describe('VersionEstiloRedis (Fase 08c, T2, integración)', () => {
  it('AGT19 — la versión parte en 0 y cada incremento la sube en uno', async () => {
    const { version } = await crearContexto();

    expect(await version.obtener()).toBe('0');
    await version.incrementar();
    await version.incrementar();
    expect(await version.obtener()).toBe('2');
  });

  it('AGT19 — usa la clave agente:prompt:version', async () => {
    const { version, redis } = await crearContexto();

    await version.incrementar();

    expect(await redis.get('agente:prompt:version')).toBe('1');
  });
});
