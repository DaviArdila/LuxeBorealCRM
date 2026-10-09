import type { Server } from 'node:http';
import { Writable } from 'node:stream';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PARAMS_PROVIDER_TOKEN, type Params } from 'nestjs-pino';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { configurarAplicacion, OPCIONES_APLICACION } from '../../src/configurar-aplicacion.js';
import { CONFIGURACION, cargarConfiguracion } from '../../src/plataforma/config/index.js';
import { crearOpcionesLogger } from '../../src/plataforma/observabilidad/index.js';
import { PrismaService } from '../../src/plataforma/prisma/index.js';
import { ClockSistema } from '../../src/plataforma/reloj/index.js';
import { asegurarConexion, REDIS_CLIENTE, type ClienteRedis } from '../../src/plataforma/redis/index.js';
import { iniciarSesionComo, type SesionDePrueba } from '../soporte/sesion-e2e.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../soporte/infraestructura.js';

// T7 (fase-12): categorías y casos del asistente por la API, con la app completa y las guardias reales de la 11a (CAS9, API7).

const CSRF = { 'x-luxe-csrf': '1' } as const;
const RUTA = '/api/v1/asistente';

type OpcionesPinoHttp = Extract<NonNullable<Params['pinoHttp']>, readonly unknown[]>[0];

/** Un solo stream por archivo: `nestjs-pino` crea su logger raíz una vez por proceso (ver `autenticacion.e2e-spec.ts`). */
const lineasLog: string[] = [];
const streamLogs = new Writable({
  write(fragmento: Buffer | string, _codificacion, listo) {
    lineasLog.push(fragmento.toString());
    listo();
  },
});

interface Contexto {
  readonly app: NestExpressApplication;
  readonly servidor: Server;
  readonly prisma: PrismaService;
  readonly redis: ClienteRedis;
}

let contexto: Contexto | undefined;

async function limpiarCasos(ctx: Contexto): Promise<void> {
  await ctx.prisma.casoAsistente.deleteMany();
  await ctx.prisma.categoriaCaso.deleteMany();
}

afterEach(async () => {
  if (contexto !== undefined) {
    await limpiarCasos(contexto);
    await contexto.app.close();
  }
  contexto = undefined;
});

async function arrancar(): Promise<Contexto> {
  lineasLog.length = 0;
  const { AppModule } = await import('../../src/app.module.js');
  const opcionesLogger = crearOpcionesLogger({ LOG_LEVEL: 'info' });
  const parametros: Params = { ...opcionesLogger, pinoHttp: [(opcionesLogger.pinoHttp ?? {}) as OpcionesPinoHttp, streamLogs] };
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(
      cargarConfiguracion({
        NODE_ENV: 'test',
        LOG_LEVEL: 'info',
        DATABASE_URL: urlPostgresDePrueba(),
        REDIS_URL: urlRedisDePrueba(),
        COLAS_TRABAJADORES: 'false',
      }),
    )
    .overrideProvider(PARAMS_PROVIDER_TOKEN)
    .useValue(parametros)
    .compile();
  const app = modulo.createNestApplication<NestExpressApplication>(OPCIONES_APLICACION);
  configurarAplicacion(app);
  await app.init();
  const redis = app.get<ClienteRedis>(REDIS_CLIENTE);
  await asegurarConexion(redis);
  contexto = { app, servidor: app.getHttpServer(), prisma: app.get(PrismaService), redis };
  await limpiarCasos(contexto);
  return contexto;
}

function codigoDe(respuesta: { readonly body: unknown }): unknown {
  return (respuesta.body as { readonly codigo?: unknown }).codigo;
}

function detalleDe(respuesta: { readonly body: unknown }): string {
  return (respuesta.body as { readonly detail?: string }).detail ?? '';
}

interface CasoApi {
  id: string;
  categoriaId: string;
  titulo: string;
  texto: string;
  modo: string;
  disparador: string;
  claveSistema: string | null;
  activo: boolean;
  actualizado: string;
}

function como(ctx: Contexto, sesion: SesionDePrueba) {
  const con = (peticion: request.Test) => peticion.set('cookie', sesion.cookie).set(CSRF);
  return {
    get: (ruta: string) => con(request(ctx.servidor).get(`${RUTA}${ruta}`)),
    post: (ruta: string, cuerpo: unknown) => con(request(ctx.servidor).post(`${RUTA}${ruta}`)).send(cuerpo as object),
    patch: (ruta: string, cuerpo: unknown) => con(request(ctx.servidor).patch(`${RUTA}${ruta}`)).send(cuerpo as object),
    put: (ruta: string, cuerpo: unknown) => con(request(ctx.servidor).put(`${RUTA}${ruta}`)).send(cuerpo as object),
    delete: (ruta: string) => con(request(ctx.servidor).delete(`${RUTA}${ruta}`)),
  };
}

async function crearCategoria(api: ReturnType<typeof como>, nombre: string): Promise<string> {
  const respuesta = await api.post('/categorias', { nombre });
  expect(respuesta.status).toBe(201);
  return (respuesta.body as { id: string }).id;
}

const NUEVO = { titulo: 'Garantía', cuandoAplica: 'Cuando preguntan por la garantía.', texto: 'La garantía cubre defectos de fábrica por ocho días.' };
const INEXISTENTE = '0199a000-0000-7000-8000-000000000999';

describe('Categorías y casos del asistente por la API (T7, e2e)', () => {
  it('CAS9 — Un asesor recibe 403 en las diez rutas y no se lee ni se escribe nada', async () => {
    const ctx = await arrancar();
    const admin = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));
    const asesor = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'asesor'));
    const categoriaId = await crearCategoria(admin, 'Políticas');
    const caso = (await admin.post('/casos', { categoriaId, ...NUEVO })).body as CasoApi;

    const respuestas = [
      await asesor.get('/categorias'),
      await asesor.post('/categorias', { nombre: 'Otra' }),
      await asesor.patch(`/categorias/${categoriaId}`, { nombre: 'Otra' }),
      await asesor.put('/categorias/orden', { ids: [categoriaId] }),
      await asesor.delete(`/categorias/${categoriaId}`),
      await asesor.get('/casos'),
      await asesor.post('/casos', { categoriaId, ...NUEVO, titulo: 'Otro' }),
      await asesor.get(`/casos/${caso.id}`),
      await asesor.patch(`/casos/${caso.id}`, { actualizado: caso.actualizado, texto: 'Del asesor.' }),
      await asesor.delete(`/casos/${caso.id}`),
    ];

    for (const respuesta of respuestas) {
      expect(respuesta.status).toBe(403);
      expect(codigoDe(respuesta)).toBe('rol-insuficiente');
    }
    expect(await ctx.prisma.categoriaCaso.count()).toBe(1);
    expect(await ctx.prisma.casoAsistente.findUniqueOrThrow({ where: { id: caso.id } })).toMatchObject({ texto: NUEVO.texto });
  });

  it('CAS9 — Sin sesión se responde 401, y una mutación sin el encabezado anti-CSRF responde 403', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');

    const sinSesion = await request(ctx.servidor).get(`${RUTA}/casos`);
    const sinEncabezado = await request(ctx.servidor).post(`${RUTA}/categorias`).set('cookie', admin.cookie).send({ nombre: 'Pagos' });

    expect(sinSesion.status).toBe(401);
    expect(codigoDe(sinSesion)).toBe('peticion-no-autenticada');
    expect(sinEncabezado.status).toBe(403);
    expect(codigoDe(sinEncabezado)).toBe('encabezado-csrf-ausente');
  });

  it('CAS2 — Crear, renombrar, reordenar y borrar categorías', async () => {
    const ctx = await arrancar();
    const api = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));

    const pagos = await crearCategoria(api, 'Pagos');
    const envios = await crearCategoria(api, 'Envíos');
    const renombrada = await api.patch(`/categorias/${pagos}`, { nombre: 'Medios de pago' });
    const orden = await api.put('/categorias/orden', { ids: [envios, pagos] });
    const lista = await api.get('/categorias');
    const incompleto = await api.put('/categorias/orden', { ids: [envios] });
    const borrada = await api.delete(`/categorias/${envios}`);

    expect(renombrada.status).toBe(200);
    expect(renombrada.body).toMatchObject({ nombre: 'Medios de pago', totalCasos: 0 });
    expect(orden.status).toBe(200);
    expect((lista.body as { categorias: { nombre: string }[] }).categorias.map((c) => c.nombre)).toEqual(['Envíos', 'Medios de pago']);
    expect(incompleto.status).toBe(422);
    expect(codigoDe(incompleto)).toBe('orden-categorias-invalido');
    expect(borrada.status).toBe(204);
    expect((await api.get('/categorias')).body).toMatchObject({ categorias: [{ nombre: 'Medios de pago' }] });
  });

  it('CAS1 — Dos categorías no pueden llamarse igual y una categoría con casos no se borra', async () => {
    const ctx = await arrancar();
    const api = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));
    const politicas = await crearCategoria(api, 'Políticas');
    await api.post('/casos', { categoriaId: politicas, ...NUEVO });

    const repetida = await api.post('/categorias', { nombre: 'politicas' });
    const conCasos = await api.delete(`/categorias/${politicas}`);
    const inexistente = await api.delete(`/categorias/${INEXISTENTE}`);

    expect(repetida.status).toBe(409);
    expect(codigoDe(repetida)).toBe('categoria-duplicada');
    expect(conCasos.status).toBe(409);
    expect(codigoDe(conCasos)).toBe('categoria-con-casos');
    expect(inexistente.status).toBe(404);
    expect(codigoDe(inexistente)).toBe('categoria-inexistente');
    expect(await ctx.prisma.categoriaCaso.count()).toBe(1);
  });

  it('CAS3 — Crear un caso de intención: 201, activo, literal y con disparador intencion', async () => {
    const ctx = await arrancar();
    const api = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));
    const pagos = await crearCategoria(api, 'Pagos');

    const respuesta = await api.post('/casos', {
      categoriaId: pagos,
      titulo: 'Medios de pago',
      cuandoAplica: 'Cuando el cliente pregunta cómo puede pagar.',
      texto: 'Aceptamos transferencia bancaria.',
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({ activo: true, modo: 'literal', disparador: 'intencion', claveSistema: null, categoriaNombre: 'Pagos' });
  });

  it('CAS3 — Editar con la fecha leída guarda; con una fecha vieja responde caso-modificado sin pisar el cambio ajeno', async () => {
    const ctx = await arrancar();
    const api = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));
    const politicas = await crearCategoria(api, 'Políticas');
    const creado = (await api.post('/casos', { categoriaId: politicas, ...NUEVO })).body as CasoApi;
    await new Promise((resolver) => setTimeout(resolver, 5));

    const editado = await api.patch(`/casos/${creado.id}`, { actualizado: creado.actualizado, texto: 'Texto del otro admin.' });
    const tarde = await api.patch(`/casos/${creado.id}`, { actualizado: creado.actualizado, texto: 'Mi texto.' });

    expect(editado.status).toBe(200);
    expect((editado.body as CasoApi).actualizado > creado.actualizado).toBe(true);
    expect(tarde.status).toBe(409);
    expect(codigoDe(tarde)).toBe('caso-modificado');
    expect(((await api.get(`/casos/${creado.id}`)).body as CasoApi).texto).toBe('Texto del otro admin.');
  });

  it('CAS3 — Desactivar un caso lo deja en el listado como inactivo; borrarlo lo quita', async () => {
    const ctx = await arrancar();
    const api = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));
    const politicas = await crearCategoria(api, 'Políticas');
    const creado = (await api.post('/casos', { categoriaId: politicas, ...NUEVO })).body as CasoApi;

    await api.patch(`/casos/${creado.id}`, { actualizado: creado.actualizado, activo: false });
    const inactivos = await api.get('/casos?activo=false');
    const borrado = await api.delete(`/casos/${creado.id}`);
    const despues = await api.get(`/casos/${creado.id}`);

    expect((inactivos.body as { items: CasoApi[] }).items.map((c) => c.titulo)).toEqual(['Garantía']);
    expect(borrado.status).toBe(204);
    expect(despues.status).toBe(404);
    expect(codigoDe(despues)).toBe('caso-inexistente');
  });

  it('CAS1 — Un caso necesita una categoría que exista y un título que no se repita', async () => {
    const ctx = await arrancar();
    const api = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));
    const politicas = await crearCategoria(api, 'Políticas');
    await api.post('/casos', { categoriaId: politicas, ...NUEVO });

    const sinCategoria = await api.post('/casos', { categoriaId: INEXISTENTE, ...NUEVO, titulo: 'Otro' });
    const repetido = await api.post('/casos', { categoriaId: politicas, ...NUEVO, titulo: 'garantia' });

    expect(sinCategoria.status).toBe(404);
    expect(codigoDe(sinCategoria)).toBe('categoria-inexistente');
    expect(repetido.status).toBe(409);
    expect(codigoDe(repetido)).toBe('caso-duplicado');
  });

  async function sistema(ctx: Contexto, api: ReturnType<typeof como>): Promise<CasoApi> {
    const categoria = await crearCategoria(api, 'Sistema');
    const ahora = new ClockSistema().ahora();
    const fila = await ctx.prisma.casoAsistente.create({
      data: {
        categoriaId: categoria,
        titulo: 'Espera del asesor',
        tituloNormalizado: 'espera del asesor',
        cuandoAplica: 'Cuando el bot pasa la conversación a un asesor.',
        disparador: 'evento',
        claveSistema: 'mensaje_espera_handoff',
        texto: 'Te paso con un asesor.',
        busquedaNormalizada: 'x',
        creado: ahora,
        actualizado: ahora,
      },
    });
    return (await api.get(`/casos/${fila.id}`)).body as CasoApi;
  }

  it('CAS4 — Un caso del sistema se edita, no se borra ni se desactiva, y la API no crea casos con clave del sistema', async () => {
    const ctx = await arrancar();
    const api = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));
    const caso = await sistema(ctx, api);

    const editado = await api.patch(`/casos/${caso.id}`, { actualizado: caso.actualizado, texto: 'Un asesor te escribe ya.' });
    const borrado = await api.delete(`/casos/${caso.id}`);
    const desactivado = await api.patch(`/casos/${caso.id}`, { actualizado: (editado.body as CasoApi).actualizado, activo: false });
    const conClave = await api.post('/casos', { categoriaId: caso.categoriaId, ...NUEVO, claveSistema: 'mensaje_espera_handoff' });

    expect(editado.status).toBe(200);
    expect(editado.body).toMatchObject({ claveSistema: 'mensaje_espera_handoff', disparador: 'evento' });
    expect(borrado.status).toBe(409);
    expect(codigoDe(borrado)).toBe('caso-del-sistema');
    expect(desactivado.status).toBe(409);
    expect(codigoDe(desactivado)).toBe('caso-del-sistema');
    expect(conClave.status).toBe(422);
    expect(codigoDe(conClave)).toBe('caso-invalido');
    expect(await ctx.prisma.casoAsistente.count()).toBe(1);
  });

  it('CAS5 — Un texto con pesos, SKU o plantilla, vacío o muy largo se rechaza con su motivo y sin copiar el texto', async () => {
    const ctx = await arrancar();
    const api = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));
    const politicas = await crearCategoria(api, 'Políticas');

    const casos: [string, string][] = [
      ['Cuesta $ 45.000 TEXTO-SECRETO-PESOS', 'pesos'],
      ['Mira el SKU-GRF-001 TEXTO-SECRETO-SKU', 'AGT16'],
      ['Hola {{nombre}} TEXTO-SECRETO-PLANTILLA', 'plantilla'],
      ['   ', 'vacío'],
      ['a'.repeat(1201), 'supera'],
    ];
    for (const [texto, motivo] of casos) {
      const respuesta = await api.post('/casos', { categoriaId: politicas, ...NUEVO, texto });
      expect(respuesta.status).toBe(422);
      expect(codigoDe(respuesta)).toBe('caso-invalido');
      expect(detalleDe(respuesta)).toContain(motivo);
      expect(JSON.stringify(respuesta.body)).not.toContain('TEXTO-SECRETO');
    }
    const sinCuando = await api.post('/casos', { categoriaId: politicas, titulo: 'Sin cuándo', texto: 'Algo.' });
    expect(sinCuando.status).toBe(422);
    expect(await ctx.prisma.casoAsistente.count()).toBe(0);
    expect(lineasLog.join('')).not.toContain('TEXTO-SECRETO');
  });

  it('CAS9 — Un caso inexistente responde 404 y un identificador mal formado responde 400', async () => {
    const ctx = await arrancar();
    const api = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));

    const inexistente = await api.get(`/casos/${INEXISTENTE}`);
    const malFormado = await api.get('/casos/no-es-un-uuid');

    expect(inexistente.status).toBe(404);
    expect(codigoDe(inexistente)).toBe('caso-inexistente');
    expect(malFormado.status).toBe(400);
    expect(codigoDe(malFormado)).toBe('validacion-fallida');
  });

  it('CAS10 — Buscar, filtrar y paginar por cursor', async () => {
    const ctx = await arrancar();
    const api = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));
    const politicas = await crearCategoria(api, 'Políticas');
    const pagos = await crearCategoria(api, 'Pagos');
    await api.post('/casos', { categoriaId: politicas, ...NUEVO });
    await api.post('/casos', { categoriaId: politicas, titulo: 'Devoluciones', cuandoAplica: 'Cuando preguntan por cambios.', texto: 'Aceptamos cambios.' });
    await api.post('/casos', { categoriaId: pagos, titulo: 'Medios de pago', cuandoAplica: 'Cuando preguntan cómo pagar.', texto: 'Aceptamos transferencia.' });

    const buscada = await api.get('/casos?q=GARANTIA');
    const porCategoria = await api.get(`/casos?categoriaId=${pagos}`);
    const primera = await api.get('/casos?limite=2');
    const cursor = (primera.body as { siguienteCursor: string }).siguienteCursor;
    const segunda = await api.get(`/casos?limite=2&cursor=${encodeURIComponent(cursor)}`);
    const mala = await api.get('/casos?cursor=basura');

    expect((buscada.body as { items: CasoApi[] }).items.map((c) => c.titulo)).toEqual(['Garantía']);
    expect((porCategoria.body as { items: CasoApi[] }).items.map((c) => c.titulo)).toEqual(['Medios de pago']);
    expect((primera.body as { items: CasoApi[] }).items).toHaveLength(2);
    expect((segunda.body as { items: CasoApi[]; siguienteCursor: string | null }).items.map((c) => c.titulo)).toEqual(['Medios de pago']);
    expect((segunda.body as { siguienteCursor: string | null }).siguienteCursor).toBeNull();
    expect(mala.status).toBe(400);
    expect(codigoDe(mala)).toBe('cursor-invalido');
  });

  it('CAS10 — La búsqueda no queda en los logs', async () => {
    const ctx = await arrancar();
    const api = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));

    await api.get('/casos?q=garantia-busqueda-privada');

    expect(lineasLog.join('')).not.toContain('garantia-busqueda-privada');
  });

  it('CAS9 — Escribir un caso no deja su texto en los logs: solo el identificador y el usuario', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');
    const api = como(ctx, admin);
    const politicas = await crearCategoria(api, 'Políticas');

    const creado = await api.post('/casos', { categoriaId: politicas, ...NUEVO, texto: 'TEXTO-SECRETO-DEL-CASO que no va a los logs.' });

    const logs = lineasLog.join('');
    expect(logs).not.toContain('TEXTO-SECRETO');
    const linea = lineasLog.map((l) => JSON.parse(l) as Record<string, unknown>).find((l) => l['evento'] === 'asistente.caso-creado');
    expect(linea).toMatchObject({ casoId: (creado.body as CasoApi).id, usuarioId: admin.usuarioId });
    expect(logs).not.toContain(admin.email);
  });

  it('CAS7 — Escribir un caso por la API sube la versión compartida: el siguiente mensaje del bot lo lee', async () => {
    const ctx = await arrancar();
    const api = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));
    const politicas = await crearCategoria(api, 'Políticas');
    const antes = await ctx.redis.get('asistente:version');

    await api.post('/casos', { categoriaId: politicas, ...NUEVO });

    expect(Number(await ctx.redis.get('asistente:version'))).toBeGreaterThan(Number(antes ?? '0'));
  });
});
