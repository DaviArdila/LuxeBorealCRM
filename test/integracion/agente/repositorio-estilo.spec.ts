import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { RepositorioEstiloPrisma } from '../../../src/modulos/agente/infraestructura/prisma/repositorio-estilo-prisma.js';
import { VersionEstiloRedis } from '../../../src/modulos/agente/infraestructura/redis/version-estilo-redis.js';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { REDIS_CLIENTE, RedisModule, type ClienteRedis } from '../../../src/plataforma/redis/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

// Fase 08c, T2: lectura del estilo desde `parametro` (AGT18) y versión compartida en Redis (AGT19) contra
// Postgres y Redis reales.

let modulo: TestingModule | undefined;

const CLAVES = ['prompt_estilo', 'prompt_estilo_version', 'prompt_estilo_historial'];

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
  await prisma.parametro.deleteMany({ where: { clave: { in: CLAVES } } });
  const redis = modulo.get<ClienteRedis>(REDIS_CLIENTE);
  if (redis.status === 'wait') await redis.connect();
  await redis.del('agente:prompt:version');
  return { repositorio: new RepositorioEstiloPrisma(prisma), version: new VersionEstiloRedis(redis), prisma, redis };
}

describe('RepositorioEstiloPrisma (Fase 08c, T2, integración)', () => {
  it('AGT18 — Un estilo publicado reemplaza al del archivo: lee el texto y su versión', async () => {
    const { repositorio, prisma } = await crearContexto();
    await prisma.parametro.createMany({
      data: [
        { clave: 'prompt_estilo', valor: 'Habla con mucha calidez.' },
        { clave: 'prompt_estilo_version', valor: 4 },
      ],
    });

    await expect(repositorio.leerVigente()).resolves.toEqual({ texto: 'Habla con mucha calidez.', version: 4 });
  });

  it('AGT18 — Sin estilo publicado devuelve null (rige el archivo)', async () => {
    const { repositorio } = await crearContexto();

    await expect(repositorio.leerVigente()).resolves.toBeNull();
  });

  it('AGT18 — Un valor en blanco o que no es texto cae al respaldo', async () => {
    const { repositorio, prisma } = await crearContexto();
    await prisma.parametro.create({ data: { clave: 'prompt_estilo', valor: '   ' } });
    await expect(repositorio.leerVigente()).resolves.toBeNull();

    await prisma.parametro.update({ where: { clave: 'prompt_estilo' }, data: { valor: 42 } });
    await expect(repositorio.leerVigente()).resolves.toBeNull();
  });

  it('un estilo sin versión registrada se lee como versión 1', async () => {
    const { repositorio, prisma } = await crearContexto();
    await prisma.parametro.create({ data: { clave: 'prompt_estilo', valor: 'Editado a mano' } });

    await expect(repositorio.leerVigente()).resolves.toEqual({ texto: 'Editado a mano', version: 1 });
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
