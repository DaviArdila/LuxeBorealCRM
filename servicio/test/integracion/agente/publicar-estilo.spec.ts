import { randomUUID } from 'node:crypto';
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

// Fase 08c, T4 / Fase 12, T3: publicar, historial y restaurar contra Postgres y Redis reales (AGT21, EST-D1, EST-D3,
// EST-D5) sobre `version_estilo`.

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
  const repositorio = new RepositorioEstiloPrisma(prisma);
  const version = new VersionEstiloRedis(redis);
  const publicar = new PublicarEstilo(repositorio, version, new ClockSistema());
  return { repositorio, version, publicar, restaurar: new RestaurarEstilo(repositorio, publicar), prisma };
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

  it('EST-D1 — Publicar crea una fila vigente nueva y la anterior deja de serlo sin borrarse', async () => {
    const { publicar, prisma } = await crearContexto();
    await publicar.ejecutar('Estilo uno');
    await publicar.ejecutar('Estilo dos');

    await publicar.ejecutar('Estilo tres');

    const filas = await prisma.versionEstilo.findMany({ orderBy: { version: 'asc' } });
    expect(filas.map((f) => [f.version, f.vigente])).toEqual([
      [1, false],
      [2, false],
      [3, true],
    ]);
  });

  it('EST-D1 — Dos publicaciones a la vez no repiten la versión y queda una sola vigente', async () => {
    const { publicar, prisma } = await crearContexto();
    await publicar.ejecutar('Estilo uno');
    await publicar.ejecutar('Estilo dos');

    await Promise.all([publicar.ejecutar('Estilo A'), publicar.ejecutar('Estilo B')]);

    const filas = await prisma.versionEstilo.findMany({ orderBy: { version: 'asc' } });
    expect(filas.map((f) => f.version)).toEqual([1, 2, 3, 4]);
    expect(filas.filter((f) => f.vigente).map((f) => f.version)).toEqual([4]);
  });

  it('EST-D1 — La base no admite dos versiones vigentes', async () => {
    const { publicar, prisma } = await crearContexto();
    await publicar.ejecutar('Estilo uno');
    await publicar.ejecutar('Estilo dos');

    await expect(prisma.versionEstilo.updateMany({ where: { version: 1 }, data: { vigente: true } })).rejects.toThrow();

    expect((await prisma.versionEstilo.findMany({ where: { vigente: true } })).map((f) => f.version)).toEqual([2]);
  });

  it('EST-D3 — Publicar por la API guarda al usuario y el historial lo muestra', async () => {
    const { publicar, repositorio, prisma } = await crearContexto();
    const usuario = await prisma.usuario.create({
      data: { email: `estilo-pub-${randomUUID()}@example.test`, nombre: 'Ana', passwordHash: 'hash-de-prueba', rol: 'admin' },
    });
    try {
      await publicar.ejecutar('Estilo de Ana', { id: usuario.id, nombre: 'Ana' });
      await publicar.ejecutar('Estilo del comando');

      await expect(repositorio.leerVigente()).resolves.toEqual({ texto: 'Estilo del comando', version: 2 });
      const historial = await repositorio.leerHistorial();
      expect(historial[0]).toMatchObject({ version: 1, publicadoPor: { id: usuario.id, nombre: 'Ana' } });
    } finally {
      await prisma.versionEstilo.deleteMany();
      await prisma.usuario.delete({ where: { id: usuario.id } });
    }
  });

  it('EST-D3 — Restaurar registra a quien restauró y el texto de la versión', async () => {
    const { publicar, restaurar, repositorio, prisma } = await crearContexto();
    const usuario = await prisma.usuario.create({
      data: { email: `estilo-res-${randomUUID()}@example.test`, nombre: 'Luis', passwordHash: 'hash-de-prueba', rol: 'admin' },
    });
    try {
      await publicar.ejecutar('Estilo uno');
      await publicar.ejecutar('Estilo dos');

      await restaurar.ejecutar(1, { id: usuario.id, nombre: 'Luis' });

      await expect(repositorio.leerVigente()).resolves.toEqual({
        texto: 'Estilo uno',
        version: 3,
        publicadoPor: { id: usuario.id, nombre: 'Luis' },
      });
    } finally {
      await prisma.versionEstilo.deleteMany();
      await prisma.usuario.delete({ where: { id: usuario.id } });
    }
  });

  it('EST-D3 — El nombre del autor se conserva aunque el usuario cambie de nombre', async () => {
    const { publicar, repositorio, prisma } = await crearContexto();
    const usuario = await prisma.usuario.create({
      data: { email: `estilo-nom-${randomUUID()}@example.test`, nombre: 'Ana', passwordHash: 'hash-de-prueba', rol: 'admin' },
    });
    try {
      await publicar.ejecutar('Estilo de Ana', { id: usuario.id, nombre: 'Ana' });
      await publicar.ejecutar('Estilo siguiente');
      await prisma.usuario.update({ where: { id: usuario.id }, data: { nombre: 'Ana María' } });

      expect((await repositorio.leerHistorial())[0]?.publicadoPor).toEqual({ id: usuario.id, nombre: 'Ana' });
    } finally {
      await prisma.versionEstilo.deleteMany();
      await prisma.usuario.delete({ where: { id: usuario.id } });
    }
  });

  it('EST-D5 — La undécima versión anterior se poda y la vigente nunca', async () => {
    const { publicar, prisma } = await crearContexto();
    for (let i = 1; i <= 11; i += 1) {
      await publicar.ejecutar(`Estilo número ${String(i)}`);
    }
    expect(await prisma.versionEstilo.count()).toBe(11);

    await publicar.ejecutar('Estilo número 12');

    const filas = await prisma.versionEstilo.findMany({ orderBy: { version: 'asc' } });
    expect(filas).toHaveLength(11);
    expect(filas.map((f) => f.version)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(filas.filter((f) => f.vigente).map((f) => f.version)).toEqual([12]);
  });

  it('AGT21 — La fecha del historial es cuándo dejó de regir la versión: la de publicación de la siguiente', async () => {
    const { repositorio, prisma } = await crearContexto();
    await prisma.versionEstilo.createMany({
      data: [
        { version: 1, texto: 'Uno', vigente: false, publicadoEn: new Date('2026-10-01T10:00:00Z') },
        { version: 2, texto: 'Dos', vigente: false, publicadoEn: new Date('2026-10-02T10:00:00Z') },
        { version: 3, texto: 'Tres', vigente: true, publicadoEn: new Date('2026-10-03T10:00:00Z') },
      ],
    });

    const historial = await repositorio.leerHistorial();

    expect(historial.map((v) => [v.version, v.fecha])).toEqual([
      [2, '2026-10-03T10:00:00.000Z'],
      [1, '2026-10-02T10:00:00.000Z'],
    ]);
  });
});
