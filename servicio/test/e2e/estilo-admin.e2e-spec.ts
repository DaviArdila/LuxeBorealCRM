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
import { asegurarConexion, REDIS_CLIENTE, type ClienteRedis } from '../../src/plataforma/redis/index.js';
import { iniciarSesionComo, type SesionDePrueba } from '../soporte/sesion-e2e.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../soporte/infraestructura.js';

// T2 (fase-11b): el estilo del bot por la API, con la app completa y las guardias reales de la 11a (AGT23, API7).

const CSRF = { 'x-luxe-csrf': '1' } as const;
const RUTA = '/api/v1/agente/estilo';

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

async function limpiarEstilo(ctx: Contexto): Promise<void> {
  await ctx.prisma.parametro.deleteMany({ where: { clave: { startsWith: 'prompt_estilo' } } });
  await ctx.redis.incr('agente:prompt:version');
}

afterEach(async () => {
  if (contexto !== undefined) {
    await limpiarEstilo(contexto);
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
  await limpiarEstilo(contexto);
  return contexto;
}

function codigoDe(respuesta: { readonly body: unknown }): unknown {
  return (respuesta.body as { readonly codigo?: unknown }).codigo;
}

function detalleDe(respuesta: { readonly body: unknown }): string {
  return (respuesta.body as { readonly detail?: string }).detail ?? '';
}

async function publicar(ctx: Contexto, sesion: SesionDePrueba, texto: string) {
  return request(ctx.servidor).put(RUTA).set(CSRF).set('cookie', sesion.cookie).send({ texto });
}

describe('Estilo del bot por la API (T2, e2e)', () => {
  it('AGT23 — Sin estilo publicado la API muestra el del archivo', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');

    const respuesta = await request(ctx.servidor).get(RUTA).set('cookie', admin.cookie);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ version: null, origen: 'archivo' });
    expect((respuesta.body as { texto: string }).texto.length).toBeGreaterThan(50);
  });

  it('AGT23 — Un admin publica y consulta el estilo vigente', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');

    const publicado = await publicar(ctx, admin, 'ESTILO-API-UNO: tono cercano y claro.');
    const vigente = await request(ctx.servidor).get(RUTA).set('cookie', admin.cookie);

    expect(publicado.status).toBe(200);
    expect(publicado.body).toEqual({ version: 1 });
    expect(vigente.body).toEqual({ version: 1, origen: 'base', texto: 'ESTILO-API-UNO: tono cercano y claro.' });
  });

  it('AGT23 — Un estilo inválido se rechaza con su motivo y la versión vigente no cambia', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');
    await publicar(ctx, admin, 'ESTILO-VIGENTE: tono cercano.');

    const rechazado = await publicar(ctx, admin, 'Cuesta $ 389.000 con envío');
    const vigente = await request(ctx.servidor).get(RUTA).set('cookie', admin.cookie);

    expect(rechazado.status).toBe(422);
    expect(rechazado.headers['content-type']).toContain('application/problem+json');
    expect(codigoDe(rechazado)).toBe('estilo-invalido');
    expect(detalleDe(rechazado)).toMatch(/pesos/);
    expect(JSON.stringify(rechazado.body)).not.toContain('389');
    expect(vigente.body).toMatchObject({ version: 1, texto: 'ESTILO-VIGENTE: tono cercano.' });
  });

  it('un cuerpo con la forma equivocada responde 400 validacion-fallida', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');

    const vacio = await publicar(ctx, admin, '');
    const largo = await publicar(ctx, admin, 'a'.repeat(4001));
    const sinTexto = await request(ctx.servidor).put(RUTA).set(CSRF).set('cookie', admin.cookie).send({});
    const versionMala = await request(ctx.servidor)
      .post(`${RUTA}/restauraciones`)
      .set(CSRF)
      .set('cookie', admin.cookie)
      .send({ version: 0 });

    for (const respuesta of [vacio, largo, sinTexto, versionMala]) {
      expect(respuesta.status).toBe(400);
      expect(codigoDe(respuesta)).toBe('validacion-fallida');
    }
  });

  it('AGT23 — Restaurar por la API publica una versión nueva con el texto de la versión elegida', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');
    await publicar(ctx, admin, 'ESTILO-A: tono cercano.');
    await publicar(ctx, admin, 'ESTILO-B: tono serio.');
    await publicar(ctx, admin, 'ESTILO-C: tono formal.');

    const restaurado = await request(ctx.servidor)
      .post(`${RUTA}/restauraciones`)
      .set(CSRF)
      .set('cookie', admin.cookie)
      .send({ version: 1 });
    const vigente = await request(ctx.servidor).get(RUTA).set('cookie', admin.cookie);

    expect(restaurado.status).toBe(200);
    expect(restaurado.body).toEqual({ version: 4 });
    expect(vigente.body).toEqual({ version: 4, origen: 'base', texto: 'ESTILO-A: tono cercano.' });
  });

  it('AGT23 — Restaurar una versión que no existe se rechaza con 404', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');
    await publicar(ctx, admin, 'ESTILO-A: tono cercano.');

    const respuesta = await request(ctx.servidor)
      .post(`${RUTA}/restauraciones`)
      .set(CSRF)
      .set('cookie', admin.cookie)
      .send({ version: 9 });

    expect(respuesta.status).toBe(404);
    expect(respuesta.headers['content-type']).toContain('application/problem+json');
    expect(codigoDe(respuesta)).toBe('version-estilo-inexistente');
    expect(detalleDe(respuesta)).toContain('9');
  });

  it('el historial lista las versiones retiradas, la más reciente primero, con versión, fecha y texto', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');
    await publicar(ctx, admin, 'ESTILO-A: tono cercano.');
    await publicar(ctx, admin, 'ESTILO-B: tono serio.');
    await publicar(ctx, admin, 'ESTILO-C: tono formal.');

    const respuesta = await request(ctx.servidor).get(`${RUTA}/historial`).set('cookie', admin.cookie);

    expect(respuesta.status).toBe(200);
    const { versiones } = respuesta.body as { versiones: { version: number; fecha: string; texto: string }[] };
    expect(versiones.map((v) => [v.version, v.texto])).toEqual([
      [2, 'ESTILO-B: tono serio.'],
      [1, 'ESTILO-A: tono cercano.'],
    ]);
    for (const version of versiones) {
      expect(Number.isNaN(Date.parse(version.fecha))).toBe(false);
    }
  });

  it('AGT23 — Un asesor no administra el estilo: las cuatro operaciones responden 403 y nada cambia', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');
    const asesor = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'asesor');
    await publicar(ctx, admin, 'ESTILO-A: tono cercano.');

    const respuestas = [
      await request(ctx.servidor).get(RUTA).set('cookie', asesor.cookie),
      await request(ctx.servidor).get(`${RUTA}/historial`).set('cookie', asesor.cookie),
      await publicar(ctx, asesor, 'ESTILO-DEL-ASESOR: otro tono.'),
      await request(ctx.servidor).post(`${RUTA}/restauraciones`).set(CSRF).set('cookie', asesor.cookie).send({ version: 1 }),
    ];
    const vigente = await request(ctx.servidor).get(RUTA).set('cookie', admin.cookie);

    for (const respuesta of respuestas) {
      expect(respuesta.status).toBe(403);
      expect(codigoDe(respuesta)).toBe('rol-insuficiente');
    }
    expect(vigente.body).toEqual({ version: 1, origen: 'base', texto: 'ESTILO-A: tono cercano.' });
  });

  it('sin sesión la API responde 401, y una mutación sin el encabezado anti-CSRF responde 403', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');

    const sinSesion = await request(ctx.servidor).get(RUTA);
    const sinEncabezado = await request(ctx.servidor).put(RUTA).set('cookie', admin.cookie).send({ texto: 'Estilo sin encabezado' });

    expect(sinSesion.status).toBe(401);
    expect(codigoDe(sinSesion)).toBe('peticion-no-autenticada');
    expect(sinEncabezado.status).toBe(403);
    expect(codigoDe(sinEncabezado)).toBe('encabezado-csrf-ausente');
  });

  it('AGT23 — Publicar por la API no escribe el texto en los logs: solo la versión y el id del usuario', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');
    const texto = 'TEXTO-SECRETO-DEL-ESTILO-QUE-NO-VA-A-LOS-LOGS';

    await publicar(ctx, admin, texto);
    await publicar(ctx, admin, 'Cuesta $ 50 TEXTO-SECRETO-RECHAZADO');

    const logs = lineasLog.join('');
    expect(logs).not.toContain('TEXTO-SECRETO');
    const linea = lineasLog.map((l) => JSON.parse(l) as Record<string, unknown>).find((l) => l['evento'] === 'agente.estilo-publicado');
    expect(linea).toMatchObject({ version: 1, usuarioId: admin.usuarioId });
    expect(logs).not.toContain(admin.email);
  });
});
