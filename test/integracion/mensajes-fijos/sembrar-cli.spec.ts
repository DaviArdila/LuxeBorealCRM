import { PrismaPg } from '@prisma/adapter-pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sembrarMensajesFijos } from '../../../scripts/sembrar-mensajes-fijos.js';
import { CATALOGO_REAL } from '../../../src/modulos/mensajes-fijos/catalogo-real.js';
import { PrismaClient } from '../../../src/plataforma/prisma/generado/client.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

// T4 (fase-11b): `npm run mensajes:sembrar` tal cual lo invoca `scripts/cli.ts`, contra el Postgres de este worker (CFN3).

const CLAVES = CATALOGO_REAL.map((m) => m.clave);
const ENTORNO = ['NODE_ENV', 'DATABASE_URL', 'REDIS_URL', 'LOG_LEVEL'] as const;

let prisma: PrismaClient;
let originales: Record<string, string | undefined>;

/**
 * El comando crea su propio contexto con `NestFactory.createApplicationContext`, cuyo `ConfiguracionModule` lee
 * `process.env` (única lectura, PLT1): fijar estas variables es el único modo de apuntarlo a la base de este worker
 * (mismo mecanismo que `importar-catalogo-cli.spec.ts`).
 */
beforeEach(async () => {
  originales = Object.fromEntries(ENTORNO.map((clave) => [clave, process.env[clave]]));
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = urlPostgresDePrueba();
  process.env.REDIS_URL = urlRedisDePrueba();
  process.env.LOG_LEVEL = 'silent';
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlPostgresDePrueba() }) });
  await prisma.parametro.deleteMany({ where: { clave: { in: CLAVES } } });
});

afterEach(async () => {
  await prisma.parametro.deleteMany({ where: { clave: { in: CLAVES } } });
  await prisma.$disconnect();
  for (const clave of ENTORNO) {
    const valor = originales[clave];
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
});

describe('mensajes:sembrar contra Postgres real (T4, CFN3)', () => {
  it('CFN3 — Siembra las diez filas con el respaldo de cada módulo y no imprime ningún texto', async () => {
    const resultado = await sembrarMensajesFijos();

    expect(resultado).toEqual({ limpio: true, mensaje: 'mensajes:sembrar: 10 insertadas, 0 ya existían.' });
    const filas = await prisma.parametro.findMany({ where: { clave: { in: CLAVES } } });
    expect(filas).toHaveLength(10);
    for (const fila of filas) {
      expect(fila.valor, fila.clave).toBe(CATALOGO_REAL.find((m) => m.clave === fila.clave)?.textoRespaldo);
      expect(resultado.mensaje).not.toContain(JSON.stringify(fila.valor));
    }
  });

  it('CFN3 — Correrla otra vez informa 0 insertadas y 10 existentes, y no pisa un texto editado', async () => {
    await sembrarMensajesFijos();
    await prisma.parametro.update({ where: { clave: 'mensaje_handoff' }, data: { valor: 'Texto del dueño.' } });

    const segunda = await sembrarMensajesFijos();

    expect(segunda).toEqual({ limpio: true, mensaje: 'mensajes:sembrar: 0 insertadas, 10 ya existían.' });
    expect((await prisma.parametro.findUniqueOrThrow({ where: { clave: 'mensaje_handoff' } })).valor).toBe('Texto del dueño.');
  });
});
