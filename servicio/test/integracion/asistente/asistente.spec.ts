import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ejecutarSembrarCasos } from '../../../scripts/sembrar-casos.js';
import {
  AsistenteModule,
  CASOS_DEL_SISTEMA,
  SembrarCasos,
  TEXTOS_ASISTENTE,
  textoDeRespaldo,
  type TextosAsistente,
} from '../../../src/modulos/asistente/index.js';
import { RepositorioSemillaPrisma } from '../../../src/modulos/asistente/infraestructura/prisma/repositorio-semilla-prisma.js';
import { VersionAsistenteRedis } from '../../../src/modulos/asistente/infraestructura/redis/version-asistente-redis.js';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { PrismaService } from '../../../src/plataforma/prisma/index.js';
import { REDIS_CLIENTE, RedisModule, type ClienteRedis } from '../../../src/plataforma/redis/index.js';
import { CLOCK, RelojModule } from '../../../src/plataforma/reloj/index.js';
import { ClockFalso } from '../../fakes/clock-falso.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

// Fase 12, T4: el módulo `asistente` contra Postgres y Redis reales (CAS4, CAS6, CAS7).

const instante = new Date('2026-10-06T15:00:00.000Z');
const CLAVES_LEGADAS = [...CASOS_DEL_SISTEMA.map((c) => (c.clave === 'contra_entrega' ? 'politica_contra_entrega' : c.clave))];

let modulo: TestingModule | undefined;

async function limpiar(prisma: PrismaService): Promise<void> {
  await prisma.casoAsistente.deleteMany();
  await prisma.categoriaCaso.deleteMany();
  await prisma.parametro.deleteMany({ where: { OR: [{ clave: { in: CLAVES_LEGADAS } }, { clave: { startsWith: 'politica_' } }] } });
}

async function crearContexto() {
  Logger.overrideLogger(false);
  const clock = new ClockFalso(instante);
  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, RelojModule, RedisModule, AsistenteModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(cargarConfiguracion({ NODE_ENV: 'test', DATABASE_URL: urlPostgresDePrueba(), REDIS_URL: urlRedisDePrueba() }))
    .overrideProvider(CLOCK)
    .useValue(clock)
    .compile();
  const prisma = modulo.get(PrismaService);
  await limpiar(prisma);
  const redis = modulo.get<ClienteRedis>(REDIS_CLIENTE);
  if (redis.status === 'wait') await redis.connect();
  await redis.del('asistente:version');
  return {
    prisma,
    redis,
    clock,
    sembrar: modulo.get(SembrarCasos),
    textos: modulo.get<TextosAsistente>(TEXTOS_ASISTENTE),
    version: new VersionAsistenteRedis(redis),
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  if (modulo !== undefined) await limpiar(modulo.get(PrismaService));
  await modulo?.close();
  modulo = undefined;
});

describe('VersionAsistenteRedis (Fase 12, T4, integración)', () => {
  it('CAS7 — la versión parte en 0, cada incremento la sube y vive en asistente:version', async () => {
    const { version, redis } = await crearContexto();

    expect(await version.obtener()).toBe('0');
    await version.incrementar();
    await version.incrementar();

    expect(await version.obtener()).toBe('2');
    expect(await redis.get('asistente:version')).toBe('2');
  });
});

describe('SembrarCasos (Fase 12, T4, integración)', () => {
  it('CAS4 — Los casos del sistema existen después de sembrar: once, cada uno con el texto de respaldo de su clave', async () => {
    const { sembrar, prisma } = await crearContexto();

    const resultado = await sembrar.ejecutar();

    expect(resultado).toEqual({ insertados: 11, existentes: 0 });
    const casos = await prisma.casoAsistente.findMany({ where: { claveSistema: { not: null } }, include: { categoria: true } });
    expect(casos).toHaveLength(11);
    for (const caso of casos) {
      expect(caso.texto, caso.claveSistema ?? '').toBe(textoDeRespaldo(caso.claveSistema as 'mensaje_handoff'));
      expect(caso.activo).toBe(true);
      expect(caso.modo).toBe('literal');
    }
    expect(casos.find((c) => c.claveSistema === 'contra_entrega')).toMatchObject({ disparador: 'intencion', categoria: { nombre: 'Políticas' } });
    expect(casos.find((c) => c.claveSistema === 'mensaje_handoff')).toMatchObject({ disparador: 'evento', categoria: { nombre: 'Sistema' } });
    expect((await prisma.categoriaCaso.findMany({ orderBy: { orden: 'asc' } })).map((c) => c.nombre)).toEqual(['Sistema', 'Políticas']);
  });

  it('CAS6 — Sembrar copia los textos que ya estaban editados', async () => {
    const { sembrar, prisma } = await crearContexto();
    await prisma.parametro.create({ data: { clave: 'mensaje_handoff', valor: 'TEXTO-PROPIO-DEL-NEGOCIO', actualizado: instante } });

    await sembrar.ejecutar();

    const caso = await prisma.casoAsistente.findUniqueOrThrow({ where: { claveSistema: 'mensaje_handoff' } });
    expect(caso.texto).toBe('TEXTO-PROPIO-DEL-NEGOCIO');
  });

  it('CAS6 — Sembrar convierte las políticas existentes en casos de intención, y también contra_entrega', async () => {
    const { sembrar, prisma } = await crearContexto();
    await prisma.parametro.createMany({
      data: [
        { clave: 'politica_devoluciones', valor: 'Aceptamos devoluciones en ocho días.', actualizado: instante },
        { clave: 'politica_garantia', valor: 'La garantía cubre defectos de fábrica.', actualizado: instante },
        { clave: 'politica_instalacion', valor: 'La instalación va por cuenta del cliente.', actualizado: instante },
      ],
    });

    const resultado = await sembrar.ejecutar();

    expect(resultado).toEqual({ insertados: 14, existentes: 0 });
    const politicas = await prisma.casoAsistente.findMany({
      where: { claveSistema: null },
      include: { categoria: true },
      orderBy: { titulo: 'asc' },
    });
    expect(politicas.map((c) => [c.titulo, c.disparador, c.categoria.nombre, c.texto])).toEqual([
      ['Devoluciones', 'intencion', 'Políticas', 'Aceptamos devoluciones en ocho días.'],
      ['Garantía', 'intencion', 'Políticas', 'La garantía cubre defectos de fábrica.'],
      ['Instalación', 'intencion', 'Políticas', 'La instalación va por cuenta del cliente.'],
    ]);
    expect(await prisma.casoAsistente.findUnique({ where: { claveSistema: 'contra_entrega' } })).not.toBeNull();
  });

  it('CAS6 — Sembrar retira de parametro las filas que copió y no toca las demás', async () => {
    const { sembrar, prisma } = await crearContexto();
    await prisma.parametro.createMany({
      data: [
        { clave: 'mensaje_handoff', valor: 'Mi traspaso', actualizado: instante },
        { clave: 'politica_garantia', valor: 'Mi garantía', actualizado: instante },
        { clave: 'llm_techo_mensual_usd', valor: 50, actualizado: instante },
      ],
    });

    await sembrar.ejecutar();

    const restantes = await prisma.parametro.findMany({ where: { clave: { in: ['mensaje_handoff', 'politica_garantia', 'llm_techo_mensual_usd'] } } });
    expect(restantes.map((f) => f.clave)).toEqual(['llm_techo_mensual_usd']);
    await prisma.parametro.delete({ where: { clave: 'llm_techo_mensual_usd' } });
  });

  it('CAS6 — Sembrar dos veces no pisa una edición e informa que no insertó casos nuevos', async () => {
    const { sembrar, prisma } = await crearContexto();
    await sembrar.ejecutar();
    await prisma.casoAsistente.update({ where: { claveSistema: 'aviso_datos' }, data: { texto: 'EDITADO-EN-LA-PANTALLA' } });
    await prisma.parametro.create({ data: { clave: 'aviso_datos', valor: 'Reapareció en parametro', actualizado: instante } });

    const resultado = await sembrar.ejecutar();

    expect(resultado).toEqual({ insertados: 0, existentes: 11 });
    expect((await prisma.casoAsistente.findUniqueOrThrow({ where: { claveSistema: 'aviso_datos' } })).texto).toBe('EDITADO-EN-LA-PANTALLA');
    // La fila que reapareció no se copió, así que no se retira.
    expect(await prisma.parametro.findUnique({ where: { clave: 'aviso_datos' } })).not.toBeNull();
    await prisma.parametro.delete({ where: { clave: 'aviso_datos' } });
  });

  it('CAS6 — Si la transacción falla no se crea ningún caso ni se retira ninguna fila', async () => {
    const { prisma, clock } = await crearContexto();
    await prisma.parametro.create({ data: { clave: 'mensaje_handoff', valor: 'Mi traspaso', actualizado: instante } });
    const repositorio = new RepositorioSemillaPrisma(prisma);

    // El segundo caso es de evento sin clave del sistema: el CHECK [manual] lo rechaza a mitad de la transacción.
    const plan = {
      categorias: [{ nombre: 'Sistema', orden: 0 }],
      casos: [
        { claveSistema: 'mensaje_handoff', titulo: 'Traspaso a un asesor', cuandoAplica: 'Cuando pasa.', disparador: 'evento' as const, modo: 'literal' as const, categoria: 'Sistema', texto: 'Mi traspaso', claveParametro: 'mensaje_handoff' },
        { claveSistema: null, titulo: 'Roto', cuandoAplica: 'Nunca.', disparador: 'evento' as const, modo: 'literal' as const, categoria: 'Sistema', texto: 'Texto', claveParametro: null },
      ],
    };

    await expect(repositorio.aplicar(plan, clock.ahora())).rejects.toThrow();

    expect(await prisma.casoAsistente.count()).toBe(0);
    expect(await prisma.categoriaCaso.count()).toBe(0);
    expect(await prisma.parametro.findUnique({ where: { clave: 'mensaje_handoff' } })).not.toBeNull();
  });

  it('CAS6 — La semilla no escribe textos: el reporte y los logs solo llevan cantidades', async () => {
    const { sembrar, prisma } = await crearContexto();
    await prisma.parametro.create({ data: { clave: 'mensaje_handoff', valor: 'TEXTO-CONFIDENCIAL-DEL-NEGOCIO', actualizado: instante } });
    const espiados = [vi.spyOn(Logger.prototype, 'log'), vi.spyOn(Logger.prototype, 'warn'), vi.spyOn(Logger.prototype, 'error')];
    const salida = vi.spyOn(process.stdout, 'write');

    const informe = await ejecutarSembrarCasos({ sembrar });

    expect(informe).toEqual({ limpio: true, mensaje: 'casos:sembrar: 11 insertados, 0 ya existían.' });
    for (const espia of espiados) expect(JSON.stringify(espia.mock.calls)).not.toContain('TEXTO-CONFIDENCIAL');
    expect(JSON.stringify(salida.mock.calls)).not.toContain('TEXTO-CONFIDENCIAL');
  });

  it('sembrar sube la versión compartida', async () => {
    const { sembrar, version } = await crearContexto();

    await sembrar.ejecutar();

    expect(await version.obtener()).toBe('1');
  });
});

describe('TextosAsistente contra Postgres y Redis (Fase 12, T4, integración)', () => {
  it('CAS7 — Un caso sin fila usa el respaldo del código', async () => {
    const { textos } = await crearContexto();

    expect(await textos.textoDelSistema('mensaje_handoff')).toBe(textoDeRespaldo('mensaje_handoff'));
  });

  it('CAS7 — Un caso sembrado entrega su texto, y editarlo con la versión subida rige en la siguiente lectura', async () => {
    const { textos, sembrar, prisma, version } = await crearContexto();
    await sembrar.ejecutar();
    expect(await textos.textoDelSistema('mensaje_pedir_texto_audio')).toBe(textoDeRespaldo('mensaje_pedir_texto_audio'));

    await prisma.casoAsistente.update({ where: { claveSistema: 'mensaje_pedir_texto_audio' }, data: { texto: 'Texto nuevo del audio.' } });
    // Sin subir la versión la copia en memoria sigue; con ella rige al instante (T7 sube la versión en cada escritura).
    expect(await textos.textoDelSistema('mensaje_pedir_texto_audio')).toBe(textoDeRespaldo('mensaje_pedir_texto_audio'));
    await version.incrementar();

    expect(await textos.textoDelSistema('mensaje_pedir_texto_audio')).toBe('Texto nuevo del audio.');
  });

  it('CAS7 — Un caso en blanco o inactivo en la base cae al respaldo', async () => {
    const { textos, sembrar, prisma, version } = await crearContexto();
    await sembrar.ejecutar();
    await prisma.casoAsistente.update({ where: { claveSistema: 'aviso_datos' }, data: { texto: '   ' } });
    await version.incrementar();

    expect(await textos.textoDelSistema('aviso_datos')).toBe(textoDeRespaldo('aviso_datos'));
  });
});
