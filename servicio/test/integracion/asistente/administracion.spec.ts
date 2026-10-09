import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { AdministrarCasos } from '../../../src/modulos/asistente/aplicacion/administrar-casos.js';
import { AdministrarCategorias } from '../../../src/modulos/asistente/aplicacion/administrar-categorias.js';
import { RepositorioAdministracionPrisma } from '../../../src/modulos/asistente/infraestructura/prisma/repositorio-administracion-prisma.js';
import type { VersionAsistente } from '../../../src/modulos/asistente/puertos/version-asistente.js';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { ClockSistema } from '../../../src/plataforma/reloj/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { limpiarCasos } from '../../soporte/textos-asistente.js';

// Fase 12, T7: administración de categorías y casos contra Postgres real (CAS1, CAS2, CAS3, CAS4, CAS10).

let modulo: TestingModule | undefined;

const VERSION: VersionAsistente = { obtener: () => Promise.resolve('0'), incrementar: () => Promise.resolve() };

afterEach(async () => {
  if (modulo !== undefined) await limpiarCasos(modulo.get(PrismaService));
  await modulo?.close();
  modulo = undefined;
});

async function crearContexto() {
  Logger.overrideLogger(false);
  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(cargarConfiguracion({ NODE_ENV: 'test', DATABASE_URL: urlPostgresDePrueba(), REDIS_URL: urlRedisDePrueba() }))
    .compile();
  const prisma = modulo.get(PrismaService);
  await limpiarCasos(prisma);
  const repositorio = new RepositorioAdministracionPrisma(prisma);
  const reloj = new ClockSistema();
  return {
    prisma,
    reloj,
    categorias: new AdministrarCategorias(repositorio, VERSION, reloj),
    casos: new AdministrarCasos(repositorio, VERSION, reloj),
  };
}

const NUEVO = { titulo: 'Garantía', cuandoAplica: 'Cuando preguntan por la garantía.', texto: 'La garantía cubre defectos de fábrica por ocho días.' };

async function categoria(categorias: AdministrarCategorias, nombre: string): Promise<string> {
  const resultado = await categorias.crear(nombre);
  if (!resultado.ok) throw new Error(`no se creó la categoría ${nombre}`);
  return resultado.categoria.id;
}

describe('Categorías contra Postgres (Fase 12, T7, integración)', () => {
  it('CAS2 — Crear una categoría la deja al final del orden', async () => {
    const { categorias } = await crearContexto();
    await categoria(categorias, 'Sistema');

    const resultado = await categorias.crear('Pagos');

    expect(resultado).toMatchObject({ ok: true, categoria: { nombre: 'Pagos', orden: 1, totalCasos: 0 } });
    expect((await categorias.listar()).map((c) => c.nombre)).toEqual(['Sistema', 'Pagos']);
  });

  it('CAS1 — Dos categorías no pueden llamarse igual, sin distinguir mayúsculas ni acentos', async () => {
    const { categorias, prisma } = await crearContexto();
    await categorias.crear('Políticas');

    expect(await categorias.crear('politicas')).toEqual({ ok: false, razon: 'duplicada' });
    expect(await prisma.categoriaCaso.count()).toBe(1);
  });

  it('CAS1 — Dos creaciones simultáneas de la misma categoría dejan una sola', async () => {
    const { categorias, prisma } = await crearContexto();

    const resultados = await Promise.all([categorias.crear('Pagos'), categorias.crear('PAGOS')]);

    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.categoriaCaso.count()).toBe(1);
  });

  it('CAS2 — Renombrar una categoría conserva sus casos; un nombre repetido o una categoría inexistente se rechazan', async () => {
    const { categorias, casos } = await crearContexto();
    const pagos = await categoria(categorias, 'Pagos');
    await categoria(categorias, 'Envíos');
    await casos.crear({ categoriaId: pagos, ...NUEVO });

    expect(await categorias.renombrar(pagos, 'Medios de pago')).toMatchObject({ ok: true, categoria: { nombre: 'Medios de pago', totalCasos: 1 } });
    expect(await categorias.renombrar(pagos, 'envios')).toEqual({ ok: false, razon: 'duplicada' });
    expect(await categorias.renombrar('0199a000-0000-7000-8000-000000000999', 'Otra')).toEqual({ ok: false, razon: 'inexistente' });
  });

  it('CAS2 — Reordenar deja el listado en el orden pedido; una lista incompleta no cambia nada', async () => {
    const { categorias } = await crearContexto();
    const a = await categoria(categorias, 'A');
    const b = await categoria(categorias, 'B');
    const c = await categoria(categorias, 'C');

    expect(await categorias.ordenar([c, a, b])).toMatchObject({ ok: true });
    expect((await categorias.listar()).map((x) => x.nombre)).toEqual(['C', 'A', 'B']);
    expect(await categorias.ordenar([a, b])).toEqual({ ok: false, razon: 'no-coincide' });
    expect(await categorias.ordenar([a, b, 'no-existe'])).toEqual({ ok: false, razon: 'no-coincide' });
    expect((await categorias.listar()).map((x) => x.nombre)).toEqual(['C', 'A', 'B']);
  });

  it('CAS2 — Una categoría vacía se borra; con casos no se borra y sigue existiendo', async () => {
    const { categorias, casos } = await crearContexto();
    const vacia = await categoria(categorias, 'Vacía');
    const llena = await categoria(categorias, 'Llena');
    await casos.crear({ categoriaId: llena, ...NUEVO });

    expect(await categorias.borrar(vacia)).toEqual({ ok: true });
    expect(await categorias.borrar(llena)).toEqual({ ok: false, razon: 'con-casos' });
    expect(await categorias.borrar(vacia)).toEqual({ ok: false, razon: 'inexistente' });
    expect((await categorias.listar()).map((c) => c.nombre)).toEqual(['Llena']);
  });
});

describe('Casos contra Postgres (Fase 12, T7, integración)', () => {
  it('CAS3 — Crear, leer y editar un caso de intención; editar sube la fecha de actualización', async () => {
    const { categorias, casos } = await crearContexto();
    const politicas = await categoria(categorias, 'Políticas');

    const creado = await casos.crear({ categoriaId: politicas, ...NUEVO });
    if (!creado.ok) throw new Error('no se creó el caso');
    expect(creado.caso).toMatchObject({ activo: true, modo: 'literal', disparador: 'intencion', claveSistema: null, categoriaNombre: 'Políticas' });
    await new Promise((resolver) => setTimeout(resolver, 5));
    const editado = await casos.editar(creado.caso.id, { actualizado: creado.caso.actualizado, texto: 'Cubre defectos por quince días.' });

    expect(editado).toMatchObject({ ok: true, caso: { texto: 'Cubre defectos por quince días.' } });
    if (!editado.ok) throw new Error('no se editó');
    expect(editado.caso.actualizado.getTime()).toBeGreaterThan(creado.caso.actualizado.getTime());
    expect((await casos.obtener(creado.caso.id))?.texto).toBe('Cubre defectos por quince días.');
  });

  it('CAS3 — Una edición sobre una versión vieja se rechaza y el texto del otro admin queda intacto', async () => {
    const { categorias, casos } = await crearContexto();
    const politicas = await categoria(categorias, 'Políticas');
    const creado = await casos.crear({ categoriaId: politicas, ...NUEVO });
    if (!creado.ok) throw new Error('no se creó el caso');
    await new Promise((resolver) => setTimeout(resolver, 5));
    await casos.editar(creado.caso.id, { actualizado: creado.caso.actualizado, texto: 'Texto del otro admin.' });

    const resultado = await casos.editar(creado.caso.id, { actualizado: creado.caso.actualizado, texto: 'Mi texto.' });

    expect(resultado).toEqual({ ok: false, razon: 'modificado' });
    expect((await casos.obtener(creado.caso.id))?.texto).toBe('Texto del otro admin.');
  });

  it('CAS1 — Dos casos no pueden tener el mismo título; una categoría inexistente se rechaza', async () => {
    const { categorias, casos, prisma } = await crearContexto();
    const politicas = await categoria(categorias, 'Políticas');
    await casos.crear({ categoriaId: politicas, ...NUEVO });

    expect(await casos.crear({ categoriaId: politicas, ...NUEVO, titulo: 'garantia' })).toEqual({ ok: false, razon: 'duplicado' });
    expect(await casos.crear({ categoriaId: '0199a000-0000-7000-8000-000000000999', ...NUEVO, titulo: 'Otro' })).toEqual({
      ok: false,
      razon: 'categoria-inexistente',
    });
    expect(await prisma.casoAsistente.count()).toBe(1);
  });

  it('CAS3 — Mover un caso a otra categoría y desactivarlo; borrar un caso de intención', async () => {
    const { categorias, casos } = await crearContexto();
    const a = await categoria(categorias, 'A');
    const b = await categoria(categorias, 'B');
    const creado = await casos.crear({ categoriaId: a, ...NUEVO });
    if (!creado.ok) throw new Error('no se creó el caso');

    const movido = await casos.editar(creado.caso.id, { actualizado: creado.caso.actualizado, categoriaId: b, activo: false });

    expect(movido).toMatchObject({ ok: true, caso: { categoriaNombre: 'B', activo: false } });
    expect(await casos.borrar(creado.caso.id)).toEqual({ ok: true });
    expect(await casos.obtener(creado.caso.id)).toBeNull();
    expect(await casos.borrar(creado.caso.id)).toEqual({ ok: false, razon: 'inexistente' });
  });

  it('CAS4 — Un caso del sistema no se borra, no se desactiva y conserva su clave al editarlo', async () => {
    const { categorias, casos, prisma, reloj } = await crearContexto();
    const sistema = await categoria(categorias, 'Sistema');
    const ahora = reloj.ahora();
    const fila = await prisma.casoAsistente.create({
      data: {
        categoriaId: sistema,
        titulo: 'Traspaso a un asesor',
        tituloNormalizado: 'traspaso a un asesor',
        cuandoAplica: 'Cuando el bot pasa la conversación a un asesor.',
        disparador: 'evento',
        claveSistema: 'mensaje_espera_handoff',
        texto: 'Te paso con un asesor.',
        busquedaNormalizada: 'x',
        creado: ahora,
        actualizado: ahora,
      },
    });

    expect(await casos.borrar(fila.id)).toEqual({ ok: false, razon: 'del-sistema' });
    expect(await casos.editar(fila.id, { actualizado: fila.actualizado, activo: false })).toEqual({ ok: false, razon: 'del-sistema' });
    const editado = await casos.editar(fila.id, { actualizado: fila.actualizado, texto: 'Un asesor te escribe ya.' });
    expect(editado).toMatchObject({ ok: true, caso: { claveSistema: 'mensaje_espera_handoff', disparador: 'evento', activo: true } });
  });

  async function sembrarVarios() {
    const contexto = await crearContexto();
    const politicas = await categoria(contexto.categorias, 'Políticas');
    const pagos = await categoria(contexto.categorias, 'Pagos');
    for (const [categoriaId, titulo, cuandoAplica, texto] of [
      [politicas, 'Garantía', 'Cuando preguntan por la garantía.', 'Cubre defectos de fábrica por ocho días.'],
      [politicas, 'Devoluciones', 'Cuando preguntan por cambios.', 'Aceptamos cambios con el producto sin uso.'],
      [pagos, 'Medios de pago', 'Cuando preguntan cómo pagar.', 'Aceptamos transferencia bancaria.'],
    ] as const) {
      await contexto.casos.crear({ categoriaId, titulo, cuandoAplica, texto });
    }
    return { ...contexto, politicas, pagos };
  }

  it('CAS10 — Buscar por título, por texto y por «cuándo aplica», sin distinguir mayúsculas ni acentos', async () => {
    const { casos } = await sembrarVarios();

    expect((await casos.listar({ q: 'garan' })).items.map((c) => c.titulo)).toEqual(['Garantía']);
    expect((await casos.listar({ q: 'ocho' })).items.map((c) => c.titulo)).toEqual(['Garantía']);
    expect((await casos.listar({ q: 'medios de pago' })).items.map((c) => c.titulo)).toEqual(['Medios de pago']);
    expect((await casos.listar({ q: 'cómo PAGAR' })).items.map((c) => c.titulo)).toEqual(['Medios de pago']);
    expect((await casos.listar({ q: 'GARANTIA' })).items.map((c) => c.titulo)).toEqual(['Garantía']);
    expect((await casos.listar({ q: '' })).items).toHaveLength(3);
  });

  it('CAS10 — Los comodines de SQL en la búsqueda se tratan como texto', async () => {
    const { casos } = await sembrarVarios();

    expect((await casos.listar({ q: '%' })).items).toEqual([]);
    expect((await casos.listar({ q: '_' })).items).toEqual([]);
    expect((await casos.listar({ q: '\\' })).items).toEqual([]);
  });

  it('CAS10 — Un texto con porcentaje se encuentra buscando ese porcentaje', async () => {
    const { casos, politicas } = await sembrarVarios();
    await casos.crear({ categoriaId: politicas, titulo: 'Promoción', cuandoAplica: 'Cuando preguntan por promociones.', texto: 'Hoy hay un descuento especial del diez por ciento.' });
    await casos.crear({ categoriaId: politicas, titulo: 'Impuestos', cuandoAplica: 'Cuando preguntan por el IVA.', texto: 'El precio ya incluye el 19% de IVA.' });

    expect((await casos.listar({ q: '19%' })).items.map((c) => c.titulo)).toEqual(['Impuestos']);
  });

  it('CAS10 — Los casos salen por el orden de su categoría y luego por título', async () => {
    const { casos } = await sembrarVarios();

    expect((await casos.listar({})).items.map((c) => c.titulo)).toEqual(['Devoluciones', 'Garantía', 'Medios de pago']);
  });

  it('CAS10 — Filtrar por categoría y por disparador', async () => {
    const { casos, pagos, politicas } = await sembrarVarios();

    expect((await casos.listar({ categoriaId: pagos })).items.map((c) => c.titulo)).toEqual(['Medios de pago']);
    expect((await casos.listar({ categoriaId: politicas, disparador: 'intencion' })).items).toHaveLength(2);
    expect((await casos.listar({ categoriaId: politicas, disparador: 'evento' })).items).toEqual([]);
    expect((await casos.listar({ activo: false })).items).toEqual([]);
  });

  it('CAS10 — El listado se pagina por cursor: 10, 10 y 5 casos', async () => {
    const { categorias, casos } = await crearContexto();
    const cat = await categoria(categorias, 'Muchos');
    for (let i = 1; i <= 25; i += 1) {
      await casos.crear({ categoriaId: cat, titulo: `Caso ${String(i).padStart(2, '0')}`, cuandoAplica: 'Cuando preguntan.', texto: `Texto ${String(i)}.` });
    }

    const primera = await casos.listar({ limite: 10 });
    const segunda = await casos.listar({ limite: 10, cursor: primera.siguienteCursor ?? '' });
    const tercera = await casos.listar({ limite: 10, cursor: segunda.siguienteCursor ?? '' });

    expect([primera.items.length, segunda.items.length, tercera.items.length]).toEqual([10, 10, 5]);
    expect(tercera.siguienteCursor).toBeNull();
    const titulos = [...primera.items, ...segunda.items, ...tercera.items].map((c) => c.titulo);
    expect(titulos).toEqual([...titulos].sort());
    expect(new Set(titulos).size).toBe(25);
  });

  it('CAS10 — La paginación respeta el orden entre categorías', async () => {
    const { categorias, casos } = await crearContexto();
    const a = await categoria(categorias, 'A');
    const b = await categoria(categorias, 'B');
    for (const [cat, titulo] of [[b, 'Abeja'], [a, 'Zorro'], [a, 'Águila'], [b, 'Búho']] as const) {
      await casos.crear({ categoriaId: cat, titulo, cuandoAplica: 'Cuando.', texto: 'T.' });
    }

    const primera = await casos.listar({ limite: 3 });
    const segunda = await casos.listar({ limite: 3, cursor: primera.siguienteCursor ?? '' });

    expect(primera.items.map((c) => c.titulo)).toEqual(['Águila', 'Zorro', 'Abeja']);
    expect(segunda.items.map((c) => c.titulo)).toEqual(['Búho']);
  });
});
