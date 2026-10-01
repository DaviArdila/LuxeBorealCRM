import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { PublicarEstilo } from '../../../src/modulos/agente/aplicacion/publicar-estilo.js';
import { RestaurarEstilo } from '../../../src/modulos/agente/aplicacion/restaurar-estilo.js';
import { RepositorioEstiloPrisma } from '../../../src/modulos/agente/infraestructura/prisma/repositorio-estilo-prisma.js';
import { VersionEstiloRedis } from '../../../src/modulos/agente/infraestructura/redis/version-estilo-redis.js';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { REDIS_CLIENTE, RedisModule, type ClienteRedis } from '../../../src/plataforma/redis/index.js';
import { ClockSistema } from '../../../src/plataforma/reloj/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

// Fase 08c, T4: publicar, historial y restaurar contra Postgres y Redis reales (AGT21).

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
  const repositorio = new RepositorioEstiloPrisma(prisma);
  const version = new VersionEstiloRedis(redis);
  const publicar = new PublicarEstilo(repositorio, version, new ClockSistema());
  return { repositorio, version, publicar, restaurar: new RestaurarEstilo(repositorio, publicar) };
}

describe('Publicar, historial y restaurar el estilo (Fase 08c, T4, integración)', () => {
  it('AGT21 — Publicar guarda el estilo anterior en el historial', async () => {
    const { publicar, repositorio } = await crearContexto();
    await publicar.ejecutar('Estilo uno');
    await publicar.ejecutar('Estilo dos');

    const resultado = await publicar.ejecutar('Estilo tres');

    expect(resultado).toEqual({ publicado: true, version: 3 });
    await expect(repositorio.leerVigente()).resolves.toEqual({ texto: 'Estilo tres', version: 3 });
    const historial = await repositorio.leerHistorial();
    expect(historial.map((v) => [v.version, v.texto])).toEqual([
      [2, 'Estilo dos'],
      [1, 'Estilo uno'],
    ]);
    expect(Number.isNaN(Date.parse(historial[0]?.fecha ?? ''))).toBe(false);
  });

  it('AGT21 — Restaurar una versión la publica como versión nueva', async () => {
    const { publicar, restaurar, repositorio } = await crearContexto();
    await publicar.ejecutar('Estilo uno');
    await publicar.ejecutar('Estilo dos');
    await publicar.ejecutar('Estilo tres');

    const resultado = await restaurar.ejecutar(1);

    expect(resultado).toEqual({ publicado: true, version: 4 });
    await expect(repositorio.leerVigente()).resolves.toEqual({ texto: 'Estilo uno', version: 4 });
    // El pasado no se reescribe: la versión 3 (retirada) se suma a las que ya estaban.
    expect((await repositorio.leerHistorial()).map((v) => v.version)).toEqual([3, 2, 1]);
  });

  it('AGT21 — El historial no guarda más de 10 versiones', async () => {
    const { publicar, repositorio } = await crearContexto();
    for (let i = 1; i <= 12; i += 1) {
      await publicar.ejecutar(`Estilo número ${String(i)}`);
    }

    const historial = await repositorio.leerHistorial();

    expect(historial).toHaveLength(10);
    expect(historial.map((v) => v.version)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    await expect(repositorio.leerVigente()).resolves.toMatchObject({ version: 12 });
  });

  it('cada publicación sube la versión compartida de Redis', async () => {
    const { publicar, version } = await crearContexto();

    await publicar.ejecutar('Uno');
    await publicar.ejecutar('Dos');

    expect(await version.obtener()).toBe('2');
  });

  it('dos publicaciones simultáneas no pierden versiones ni pisan el historial', async () => {
    const { publicar, repositorio } = await crearContexto();

    const resultados = await Promise.all(['A', 'B', 'C', 'D', 'E'].map((letra) => publicar.ejecutar(`Estilo ${letra}`)));

    expect(resultados.map((r) => (r.publicado ? r.version : -1)).sort()).toEqual([1, 2, 3, 4, 5]);
    await expect(repositorio.leerVigente()).resolves.toMatchObject({ version: 5 });
    expect((await repositorio.leerHistorial()).map((v) => v.version).sort()).toEqual([1, 2, 3, 4]);
  });

  it('un historial corrupto en la base se lee como vacío y no rompe la publicación', async () => {
    const { publicar, repositorio } = await crearContexto();
    const prisma = modulo!.get(PrismaService);
    await prisma.parametro.create({ data: { clave: 'prompt_estilo_historial', valor: 'no es un arreglo' } });

    await expect(repositorio.leerHistorial()).resolves.toEqual([]);
    await expect(publicar.ejecutar('Estilo nuevo')).resolves.toEqual({ publicado: true, version: 1 });
  });
});
