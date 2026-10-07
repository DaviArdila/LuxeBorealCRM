import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { PublicarEstilo } from '../../../src/modulos/agente/aplicacion/publicar-estilo.js';
import { SembrarEstilo } from '../../../src/modulos/agente/aplicacion/sembrar-estilo.js';
import { validarEstilo } from '../../../src/modulos/agente/dominio/validar-estilo.js';
import { RepositorioEstiloPrisma } from '../../../src/modulos/agente/infraestructura/prisma/repositorio-estilo-prisma.js';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { REDIS_CLIENTE, RedisModule, type ClienteRedis } from '../../../src/plataforma/redis/index.js';
import { ClockSistema } from '../../../src/plataforma/reloj/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { VersionEstiloDePrueba } from '../../soporte/version-estilo-de-prueba.js';

// EST-D6: la semilla del estilo inicial contra Postgres y Redis reales.

const ARCHIVO_ESTILO_INICIAL = path.join(import.meta.dirname, '../../../prisma/datos/estilo-inicial.md');

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
  const repositorio = new RepositorioEstiloPrisma(prisma);
  const version = new VersionEstiloDePrueba(redis);
  await redis.del(version.claveDePrueba);
  const publicar = new PublicarEstilo(repositorio, version, new ClockSistema());
  return { prisma, repositorio, version, publicar, sembrar: new SembrarEstilo(repositorio, publicar) };
}

describe('Semilla del estilo inicial (EST-D6, integración)', () => {
  it('EST-D6 — El estilo inicial del repositorio pasa la validación de publicación', async () => {
    const texto = await readFile(ARCHIVO_ESTILO_INICIAL, 'utf8');

    expect(validarEstilo(texto)).toEqual({ valido: true });
    expect(texto).toMatch(/grifos/i);
    expect(texto).toMatch(/lavaplatos/i);
  });

  it('EST-D6 — Una tabla vacía queda con el estilo inicial como versión 1 vigente y sin autor', async () => {
    const { sembrar, repositorio, version } = await crearContexto();
    const texto = await readFile(ARCHIVO_ESTILO_INICIAL, 'utf8');

    await expect(sembrar.ejecutar(texto)).resolves.toEqual({ sembrado: true, version: 1 });

    await expect(repositorio.leerVigente()).resolves.toEqual({ texto, version: 1 });
    await expect(repositorio.leerHistorial()).resolves.toEqual([]);
    await expect(version.obtener()).resolves.not.toBe('0');
  });

  it('EST-D6 — Una segunda corrida no agrega nada ni toca la versión compartida', async () => {
    const { sembrar, prisma, version } = await crearContexto();
    await sembrar.ejecutar('# Cómo escribes\n\n- Sin emojis.\n');
    const compartida = await version.obtener();

    await expect(sembrar.ejecutar('# Otro estilo\n')).resolves.toEqual({ sembrado: false });

    await expect(prisma.versionEstilo.count()).resolves.toBe(1);
    await expect(version.obtener()).resolves.toBe(compartida);
  });

  it('EST-D6 — Con un estilo del usuario publicado no agrega ninguna versión', async () => {
    const { sembrar, publicar, repositorio } = await crearContexto();
    await publicar.ejecutar('Estilo del usuario uno');
    await publicar.ejecutar('Estilo del usuario dos');

    await expect(sembrar.ejecutar('# Estilo inicial\n')).resolves.toEqual({ sembrado: false });

    await expect(repositorio.leerVigente()).resolves.toEqual({ texto: 'Estilo del usuario dos', version: 2 });
    expect((await repositorio.leerHistorial()).map((v) => v.version)).toEqual([1]);
  });

  it('EST-D6 — Con solo una versión retirada tampoco siembra nada', async () => {
    const { sembrar, prisma } = await crearContexto();
    await prisma.versionEstilo.create({
      data: { version: 3, texto: 'Estilo retirado', vigente: false, publicadoEn: new Date('2026-10-01T00:00:00Z') },
    });

    await expect(sembrar.ejecutar('# Estilo inicial\n')).resolves.toEqual({ sembrado: false });

    await expect(prisma.versionEstilo.count()).resolves.toBe(1);
  });
});
