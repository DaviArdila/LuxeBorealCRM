import type { Server } from 'node:http';
import { Writable } from 'node:stream';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PARAMS_PROVIDER_TOKEN, type Params } from 'nestjs-pino';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { configurarAplicacion, OPCIONES_APLICACION } from '../../src/configurar-aplicacion.js';
import { CATALOGO_REAL } from '../../src/modulos/mensajes-fijos/catalogo-real.js';
import { CONFIGURACION, cargarConfiguracion } from '../../src/plataforma/config/index.js';
import { crearOpcionesLogger } from '../../src/plataforma/observabilidad/index.js';
import { PrismaService } from '../../src/plataforma/prisma/index.js';
import { iniciarSesionComo, type SesionDePrueba } from '../soporte/sesion-e2e.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../soporte/infraestructura.js';
import { limpiarCasos } from '../soporte/textos-asistente.js';

// T4 (fase-11b): los mensajes fijos por la API, con la app completa y las guardias reales de la 11a (CFN1, CFN2, API7).

const CSRF = { 'x-luxe-csrf': '1' } as const;
const RUTA = '/api/v1/mensajes-fijos';
const CLAVES = CATALOGO_REAL.map((m) => m.clave);
const AJENA = 'llm_techo_mensual_usd';

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
}

let contexto: Contexto | undefined;

async function limpiar(ctx: Contexto): Promise<void> {
  await limpiarCasos(ctx.prisma);
  await ctx.prisma.parametro.deleteMany({ where: { clave: AJENA } });
}

afterEach(async () => {
  if (contexto !== undefined) {
    await limpiar(contexto);
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
  contexto = { app, servidor: app.getHttpServer(), prisma: app.get(PrismaService) };
  await limpiar(contexto);
  return contexto;
}

function codigoDe(respuesta: { readonly body: unknown }): unknown {
  return (respuesta.body as { readonly codigo?: unknown }).codigo;
}

function detalleDe(respuesta: { readonly body: unknown }): string {
  return (respuesta.body as { readonly detail?: string }).detail ?? '';
}

async function guardar(ctx: Contexto, sesion: SesionDePrueba, clave: string, texto: string) {
  return request(ctx.servidor).put(`${RUTA}/${clave}`).set(CSRF).set('cookie', sesion.cookie).send({ texto });
}

interface MensajeApi {
  clave: string;
  descripcion: string;
  texto: string;
  origen: 'base' | 'respaldo';
  actualizado: string | null;
}

describe('Mensajes fijos por la API (T4, e2e)', () => {
  it('CFN1 — La lista trae los diez mensajes: el editado con origen base y el resto con su respaldo', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');
    await guardar(ctx, admin, 'mensaje_handoff', 'Ya te comunico con un asesor.');

    const respuesta = await request(ctx.servidor).get(RUTA).set('cookie', admin.cookie);

    expect(respuesta.status).toBe(200);
    const { mensajes } = respuesta.body as { mensajes: MensajeApi[] };
    expect(mensajes.map((m) => m.clave)).toEqual(CLAVES);
    expect(mensajes.find((m) => m.clave === 'mensaje_handoff')).toMatchObject({ origen: 'base', texto: 'Ya te comunico con un asesor.' });
    const techo = mensajes.find((m) => m.clave === 'mensaje_techo_gasto');
    expect(techo).toMatchObject({ origen: 'respaldo', actualizado: null });
    expect(techo?.texto).toBe(CATALOGO_REAL.find((m) => m.clave === 'mensaje_techo_gasto')?.textoRespaldo);
    expect(Number.isNaN(Date.parse(mensajes.find((m) => m.clave === 'mensaje_handoff')?.actualizado ?? ''))).toBe(false);
  });

  it('CFN1 — Una clave fuera de la lista no aparece', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');
    await ctx.prisma.parametro.create({ data: { clave: AJENA, valor: 10 } });

    const respuesta = await request(ctx.servidor).get(RUTA).set('cookie', admin.cookie);

    expect((respuesta.body as { mensajes: MensajeApi[] }).mensajes.map((m) => m.clave)).not.toContain(AJENA);
  });

  it('CFN1 — Un asesor no ve los mensajes fijos y tampoco los edita', async () => {
    const ctx = await arrancar();
    const asesor = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'asesor');

    const lista = await request(ctx.servidor).get(RUTA).set('cookie', asesor.cookie);
    const edicion = await guardar(ctx, asesor, 'mensaje_handoff', 'Texto del asesor.');

    for (const respuesta of [lista, edicion]) {
      expect(respuesta.status).toBe(403);
      expect(respuesta.headers['content-type']).toContain('application/problem+json');
      expect(codigoDe(respuesta)).toBe('rol-insuficiente');
    }
    expect(await ctx.prisma.casoAsistente.findUnique({ where: { claveSistema: 'mensaje_handoff' } })).toBeNull();
  });

  it('CFN2 — Guardar devuelve el mensaje con origen base y la fecha de la edición', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');

    const respuesta = await guardar(ctx, admin, 'mensaje_handoff', '  Ya te comunico con un asesor.\n');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({
      clave: 'mensaje_handoff',
      texto: 'Ya te comunico con un asesor.',
      origen: 'base',
    });
    expect(Number.isNaN(Date.parse((respuesta.body as MensajeApi).actualizado ?? ''))).toBe(false);
    expect((await ctx.prisma.casoAsistente.findUniqueOrThrow({ where: { claveSistema: 'mensaje_handoff' } })).texto).toBe('Ya te comunico con un asesor.');
  });

  it('CFN2 — Un texto inválido se rechaza con 422, su motivo, y el texto vigente no cambia', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');
    await guardar(ctx, admin, 'mensaje_handoff', 'Texto vigente.');

    const casos: [string, RegExp][] = [
      ['   ', /vac/],
      ['a'.repeat(1001), /1000/],
      ['Te sale en $ 120.000', /pesos/],
      ['Hola {{nombre}}', /plantilla/],
    ];
    for (const [texto, motivo] of casos) {
      const respuesta = await guardar(ctx, admin, 'mensaje_handoff', texto);

      expect(respuesta.status).toBe(422);
      expect(respuesta.headers['content-type']).toContain('application/problem+json');
      expect(codigoDe(respuesta)).toBe('mensaje-fijo-invalido');
      expect(detalleDe(respuesta)).toMatch(motivo);
      expect(JSON.stringify(respuesta.body)).not.toContain('120.000');
    }
    expect((await ctx.prisma.casoAsistente.findUniqueOrThrow({ where: { claveSistema: 'mensaje_handoff' } })).texto).toBe('Texto vigente.');
  });

  it('CFN2 — Una clave desconocida responde 404 y no escribe nada', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');

    const respuesta = await guardar(ctx, admin, AJENA, 'Un texto cualquiera');

    expect(respuesta.status).toBe(404);
    expect(codigoDe(respuesta)).toBe('mensaje-fijo-desconocido');
    expect(await ctx.prisma.parametro.findUnique({ where: { clave: AJENA } })).toBeNull();
  });

  it('un cuerpo con la forma equivocada responde 400 validacion-fallida', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');

    const sinTexto = await request(ctx.servidor).put(`${RUTA}/mensaje_handoff`).set(CSRF).set('cookie', admin.cookie).send({});
    const noEsTexto = await request(ctx.servidor).put(`${RUTA}/mensaje_handoff`).set(CSRF).set('cookie', admin.cookie).send({ texto: 5 });
    const enorme = await guardar(ctx, admin, 'mensaje_handoff', 'a'.repeat(4001));

    for (const respuesta of [sinTexto, noEsTexto, enorme]) {
      expect(respuesta.status).toBe(400);
      expect(codigoDe(respuesta)).toBe('validacion-fallida');
    }
  });

  it('sin sesión responde 401 y una edición sin el encabezado anti-CSRF responde 403', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');

    const sinSesion = await request(ctx.servidor).get(RUTA);
    const sinEncabezado = await request(ctx.servidor).put(`${RUTA}/mensaje_handoff`).set('cookie', admin.cookie).send({ texto: 'Sin encabezado' });

    expect(sinSesion.status).toBe(401);
    expect(codigoDe(sinSesion)).toBe('peticion-no-autenticada');
    expect(sinEncabezado.status).toBe(403);
    expect(codigoDe(sinEncabezado)).toBe('encabezado-csrf-ausente');
  });

  it('CFN2 — Guardar un mensaje no escribe el texto en los logs: solo la clave y el id del usuario', async () => {
    const ctx = await arrancar();
    const admin = await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin');

    await guardar(ctx, admin, 'mensaje_handoff', 'TEXTO-SECRETO-DEL-MENSAJE-QUE-NO-VA-A-LOS-LOGS');
    await guardar(ctx, admin, 'mensaje_handoff', 'Cuesta $ 50 TEXTO-SECRETO-RECHAZADO');

    const logs = lineasLog.join('');
    expect(logs).not.toContain('TEXTO-SECRETO');
    const linea = lineasLog.map((l) => JSON.parse(l) as Record<string, unknown>).find((l) => l['evento'] === 'mensajes-fijos.guardado');
    expect(linea).toMatchObject({ clave: 'mensaje_handoff', usuarioId: admin.usuarioId });
    expect(logs).not.toContain(admin.email);
  });
});
