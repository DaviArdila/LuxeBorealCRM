import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ejecutarSembrarCasos } from '../../../scripts/sembrar-casos.js';
import {
  AsistenteModule,
  CASOS_DEL_SISTEMA,
  SembrarCasos,
  CONSULTA_CASOS,
  TEXTOS_ASISTENTE,
  textoDeRespaldo,
  type ConsultaCasos,
  type TextosAsistente,
} from '../../../src/modulos/asistente/index.js';
import { RepositorioSemillaPrisma } from '../../../src/modulos/asistente/infraestructura/prisma/repositorio-semilla-prisma.js';
import { VersionAsistenteRedis } from '../../../src/modulos/asistente/infraestructura/redis/version-asistente-redis.js';
import { VERSION_ASISTENTE } from '../../../src/modulos/asistente/puertos/version-asistente.js';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { PrismaService } from '../../../src/plataforma/prisma/index.js';
import { REDIS_CLIENTE, RedisModule, type ClienteRedis } from '../../../src/plataforma/redis/index.js';
import { CLOCK, RelojModule } from '../../../src/plataforma/reloj/index.js';
import { ClockFalso } from '../../fakes/clock-falso.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { crearCasoDeIntencion } from '../../soporte/textos-asistente.js';
import { VersionAsistenteDePrueba } from '../../soporte/version-asistente-de-prueba.js';

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
    .overrideProvider(VERSION_ASISTENTE)
    .useFactory({ factory: (redis: ClienteRedis) => new VersionAsistenteDePrueba(redis), inject: [REDIS_CLIENTE] })
    .compile();
  const prisma = modulo.get(PrismaService);
  await limpiar(prisma);
  const redis = modulo.get<ClienteRedis>(REDIS_CLIENTE);
  if (redis.status === 'wait') await redis.connect();
  const version = modulo.get<VersionAsistenteDePrueba>(VERSION_ASISTENTE);
  await redis.del(version.claveDePrueba);
  return {
    prisma,
    redis,
    clock,
    sembrar: modulo.get(SembrarCasos),
    textos: modulo.get<TextosAsistente>(TEXTOS_ASISTENTE),
    casos: modulo.get<ConsultaCasos>(CONSULTA_CASOS),
    version,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  if (modulo !== undefined) await limpiar(modulo.get(PrismaService));
  await modulo?.close();
  modulo = undefined;
});

describe('VersionAsistenteRedis (Fase 12, T4, integración)', () => {
  it('CAS7 — la versión parte en 0 y cada incremento la sube en uno', async () => {
    const { version } = await crearContexto();

    expect(await version.obtener()).toBe('0');
    await version.incrementar();
    await version.incrementar();

    expect(await version.obtener()).toBe('2');
  });

  it('CAS7 — la versión compartida vive en la clave asistente:version', async () => {
    const { redis } = await crearContexto();
    const incr = vi.spyOn(redis, 'incr');

    await new VersionAsistenteRedis(redis).incrementar();

    expect(incr).toHaveBeenCalledWith('asistente:version');
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

    const informe = await ejecutarSembrarCasos({
      sembrar,
      sembrarEstilo: { ejecutar: () => Promise.resolve({ sembrado: false }) },
      leerEstiloInicial: () => Promise.resolve('# Estilo\n'),
    });

    expect(informe).toEqual({ limpio: true, mensaje: 'casos:sembrar: 11 insertados, 0 ya existían.\nestilo: ya existía' });
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

describe('ConsultaCasos contra Postgres y Redis (Fase 12, T6, integración)', () => {
  it('CAS8 — El índice lista los casos de intención activos, sin el inactivo ni los del sistema que dispara el código', async () => {
    const { casos, sembrar, prisma, version } = await crearContexto();
    await sembrar.ejecutar();
    await crearCasoDeIntencion(prisma, { titulo: 'Garantía', cuandoAplica: 'Cuando preguntan por la garantía.', texto: 'Cubre ocho días.' });
    await crearCasoDeIntencion(prisma, { titulo: 'Oferta vieja', cuandoAplica: 'Cuando preguntan por la oferta.', texto: 'Ya no existe.', activo: false });
    await version.incrementar();

    const indice = await casos.indice();

    expect(indice.map((e) => e.titulo)).toEqual(['Contra entrega', 'Garantía']);
    expect(indice[1]).toEqual({ titulo: 'Garantía', cuandoAplica: 'Cuando preguntan por la garantía.' });
    expect(JSON.stringify(indice)).not.toContain('Cubre ocho días');
  });

  it('CAS8 — consultar_caso encuentra por título sin acentos ni mayúsculas, y lista los disponibles si no existe', async () => {
    const { casos, prisma, version } = await crearContexto();
    await crearCasoDeIntencion(prisma, { titulo: 'Garantía', cuandoAplica: 'Cuando preguntan.', texto: 'Cubre ocho días.', modo: 'guia' });
    await version.incrementar();

    expect(await casos.consultar('GARANTIA')).toEqual({ encontrado: true, titulo: 'Garantía', modo: 'guia', texto: 'Cubre ocho días.' });
    expect(await casos.consultar('Medios de pago')).toEqual({ encontrado: false, titulosDisponibles: ['Garantía'] });
  });

  it('CAS8 — Un caso desactivado ya no se consulta', async () => {
    const { casos, prisma, version } = await crearContexto();
    await crearCasoDeIntencion(prisma, { titulo: 'Garantía', cuandoAplica: 'Cuando preguntan.', texto: 'Cubre ocho días.' });
    await version.incrementar();
    expect(await casos.consultar('Garantía')).toMatchObject({ encontrado: true });

    await prisma.casoAsistente.update({ where: { tituloNormalizado: 'garantia' }, data: { activo: false } });
    await version.incrementar();

    expect(await casos.consultar('Garantía')).toEqual({ encontrado: false, titulosDisponibles: [] });
  });

  it('CAS8 — Los casos salen por el orden de su categoría y luego por título', async () => {
    const { casos, prisma, version } = await crearContexto();
    const ahora = new Date('2026-10-06T15:00:00.000Z');
    const a = await prisma.categoriaCaso.create({ data: { nombre: 'Zeta', nombreNormalizado: 'zeta', orden: 0, creado: ahora, actualizado: ahora } });
    const b = await prisma.categoriaCaso.create({ data: { nombre: 'Alfa', nombreNormalizado: 'alfa', orden: 1, creado: ahora, actualizado: ahora } });
    for (const [categoriaId, titulo] of [[b.id, 'Abeja'], [a.id, 'Zorro'], [a.id, 'Águila'], [b.id, 'Búho']] as const) {
      await prisma.casoAsistente.create({
        data: {
          categoriaId,
          titulo,
          tituloNormalizado: titulo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
          cuandoAplica: 'Cuando.',
          disparador: 'intencion',
          texto: 'T.',
          busquedaNormalizada: 't',
          creado: ahora,
          actualizado: ahora,
        },
      });
    }
    await version.incrementar();

    expect((await casos.indice()).map((e) => e.titulo)).toEqual(['Águila', 'Zorro', 'Abeja', 'Búho']);
  });

  it('CAS8 — Un índice de 70 casos se recorta a los primeros 60 y avisa solo con conteos', async () => {
    const { casos, prisma, version } = await crearContexto();
    for (let i = 1; i <= 70; i += 1) {
      await crearCasoDeIntencion(prisma, { titulo: `Caso ${String(i).padStart(3, '0')}`, cuandoAplica: 'Cuando preguntan.', texto: 'TEXTO-CONFIDENCIAL' });
    }
    await version.incrementar();
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const indice = await casos.indice();

    expect(indice).toHaveLength(60);
    expect(indice[59]?.titulo).toBe('Caso 060');
    expect(aviso).toHaveBeenCalledWith({ evento: 'asistente.indice-recortado', total: 70, incluidos: 60 });
    expect(JSON.stringify(aviso.mock.calls)).not.toContain('TEXTO-CONFIDENCIAL');
  });

  it('CAS8 — Un caso editado cambia el siguiente turno sin reiniciar', async () => {
    const { casos, prisma, version } = await crearContexto();
    await crearCasoDeIntencion(prisma, { titulo: 'Garantía', cuandoAplica: 'Cuando preguntan.', texto: 'Antes.' });
    await version.incrementar();
    expect(await casos.consultar('Garantía')).toMatchObject({ texto: 'Antes.' });

    await prisma.casoAsistente.update({ where: { tituloNormalizado: 'garantia' }, data: { texto: 'Después.' } });
    await version.incrementar();

    expect(await casos.consultar('Garantía')).toMatchObject({ texto: 'Después.' });
  });
});
