import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Writable } from 'node:stream';
import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PARAMS_PROVIDER_TOKEN, type Params } from 'nestjs-pino';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { configurarAplicacion, OPCIONES_APLICACION } from '../../src/configurar-aplicacion.js';
import { Roles } from '../../src/modulos/usuarios/index.js';
import { CONFIGURACION, cargarConfiguracion, type Configuracion } from '../../src/plataforma/config/index.js';
import { crearOpcionesLogger } from '../../src/plataforma/observabilidad/index.js';
import { PrismaService } from '../../src/plataforma/prisma/index.js';
import { asegurarConexion, REDIS_CLIENTE, type ClienteRedis } from '../../src/plataforma/redis/index.js';
import { cargarFixtureChatwoot, firmarComoChatwoot } from '../soporte/chatwoot.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../soporte/infraestructura.js';

// T6 (fase-11a): los tres endpoints de autenticación con la app completa (USR2, USR4-USR6, USR9, API7).

const SECRETO_WEBHOOK = 'secreto-webhook-de-prueba';
const CONTRASENA = 'contrasena-del-e2e-123';
const CSRF = { 'x-luxe-csrf': '1' } as const;

/** Ruta de admin que solo existe en este test: la 11a todavía no trae ninguna propia (API7). */
@Controller('fixture-autenticacion')
class FixtureAdminController {
  @Get('solo-admin')
  @Roles('admin')
  soloAdmin(): { ok: true } {
    return { ok: true };
  }
}

type OpcionesPinoHttp = Extract<NonNullable<Params['pinoHttp']>, readonly unknown[]>[0];

interface Contexto {
  readonly app: NestExpressApplication;
  readonly servidor: Server;
  readonly prisma: PrismaService;
  readonly redis: ClienteRedis;
  readonly lineasLog: string[];
}

let contexto: Contexto | undefined;

afterEach(async () => {
  await contexto?.app.close();
  contexto = undefined;
});

function configuracion(nodeEnv: Configuracion['NODE_ENV']): Configuracion {
  return cargarConfiguracion({
    NODE_ENV: nodeEnv,
    LOG_LEVEL: 'info',
    DATABASE_URL: urlPostgresDePrueba(),
    REDIS_URL: urlRedisDePrueba(),
    COLAS_TRABAJADORES: 'false',
    CHATWOOT_WEBHOOK_SECRETO: SECRETO_WEBHOOK,
    // `production` exige estos secretos al validar; aquí solo importa el atributo Secure de la cookie (USR2).
    ...(nodeEnv === 'production'
      ? { CHATWOOT_BOT_TOKEN: 'ficticio', TELEGRAM_BOT_TOKEN: 'ficticio', TELEGRAM_CHAT_ID: '-1', OPENROUTER_API_KEY: 'ficticia' }
      : {}),
  });
}

/**
 * Un solo stream para todo el archivo: `nestjs-pino` crea su logger raíz una vez por proceso, con el destino de la
 * primera app que arranca, así que un stream nuevo por test dejaría de recibir líneas desde el segundo test.
 */
const lineasLog: string[] = [];
const streamLogs = new Writable({
  write(fragmento: Buffer | string, _codificacion, listo) {
    lineasLog.push(fragmento.toString());
    listo();
  },
});

/** App completa (mismo cableado que `main.ts`) con los logs de pino al stream en memoria (USR9). */
async function arrancar(nodeEnv: Configuracion['NODE_ENV'] = 'test'): Promise<Contexto> {
  lineasLog.length = 0;
  const { AppModule } = await import('../../src/app.module.js');
  const opcionesLogger = crearOpcionesLogger({ LOG_LEVEL: 'info' });
  const parametros: Params = { ...opcionesLogger, pinoHttp: [(opcionesLogger.pinoHttp ?? {}) as OpcionesPinoHttp, streamLogs] };
  const modulo = await Test.createTestingModule({ imports: [AppModule], controllers: [FixtureAdminController] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracion(nodeEnv))
    .overrideProvider(PARAMS_PROVIDER_TOKEN)
    .useValue(parametros)
    .compile();
  const app = modulo.createNestApplication<NestExpressApplication>(OPCIONES_APLICACION);
  configurarAplicacion(app);
  await app.init();
  const redis = app.get<ClienteRedis>(REDIS_CLIENTE);
  await asegurarConexion(redis);
  contexto = { app, servidor: app.getHttpServer(), prisma: app.get(PrismaService), redis, lineasLog };
  return contexto;
}

async function crearUsuario(
  ctx: Contexto,
  rol: 'admin' | 'asesor',
): Promise<{ id: string; email: string }> {
  const { HasheadorArgon2 } = await import('../../src/modulos/usuarios/infraestructura/hasheador-argon2.js');
  const email = `persona-${randomUUID()}@ejemplo.co`;
  const usuario = await ctx.prisma.usuario.create({
    data: { email, nombre: 'Persona del e2e', passwordHash: await new HasheadorArgon2().hashear(CONTRASENA), rol },
  });
  return { id: usuario.id, email };
}

function cookieDeSesion(setCookie: unknown): string {
  const lista = Array.isArray(setCookie) ? (setCookie as string[]) : [];
  const cookie = lista.find((linea) => linea.startsWith('luxe_sesion='));
  if (cookie === undefined) throw new Error('la respuesta no trae la cookie luxe_sesion');
  return cookie;
}

function valorDeCookie(cookie: string): string {
  return cookie.split(';')[0]?.slice('luxe_sesion='.length) ?? '';
}

function codigoDe(respuesta: { readonly body: unknown }): unknown {
  return (respuesta.body as { readonly codigo?: unknown }).codigo;
}

async function iniciarSesion(ctx: Contexto, email: string, contrasena = CONTRASENA) {
  return request(ctx.servidor).post('/api/v1/auth/sesion').set(CSRF).send({ email, contrasena });
}

describe('Autenticación por cookie (T6, e2e)', () => {
  it('inicia sesión, consulta la sesión actual y la cierra: recorrido completo', async () => {
    const ctx = await arrancar();
    const usuario = await crearUsuario(ctx, 'admin');

    const inicio = await iniciarSesion(ctx, usuario.email.toUpperCase());
    const cookie = cookieDeSesion(inicio.headers['set-cookie']);
    const yo = await request(ctx.servidor).get('/api/v1/auth/yo').set('cookie', cookie.split(';')[0] ?? '');

    expect(inicio.status).toBe(200);
    expect(inicio.body).toEqual({ id: usuario.id, nombre: 'Persona del e2e', email: usuario.email, rol: 'admin' });
    expect(yo.status).toBe(200);
    expect(yo.body).toEqual(inicio.body);
  });

  it('una contraseña incorrecta responde 401 credenciales-invalidas en problem+json y sin cookie', async () => {
    const ctx = await arrancar();
    const usuario = await crearUsuario(ctx, 'admin');

    const respuesta = await iniciarSesion(ctx, usuario.email, 'otra-contrasena-mala');

    expect(respuesta.status).toBe(401);
    expect(respuesta.headers['content-type']).toContain('application/problem+json');
    expect(codigoDe(respuesta)).toBe('credenciales-invalidas');
    expect(respuesta.headers['set-cookie']).toBeUndefined();
  });

  it('el intento que pasa el límite responde 429 demasiados-intentos con Retry-After', async () => {
    const ctx = await arrancar();
    const usuario = await crearUsuario(ctx, 'asesor');
    for (let intento = 0; intento < 5; intento += 1) await iniciarSesion(ctx, usuario.email, 'mala-mala-mala');

    const respuesta = await iniciarSesion(ctx, usuario.email);

    expect(respuesta.status).toBe(429);
    expect(codigoDe(respuesta)).toBe('demasiados-intentos');
    expect(Number(respuesta.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('un cuerpo sin correo válido responde 400 validacion-fallida sin repetir el valor', async () => {
    const ctx = await arrancar();

    const respuesta = await request(ctx.servidor)
      .post('/api/v1/auth/sesion')
      .set(CSRF)
      .send({ email: 'no-es-un-correo', contrasena: 'x' });

    expect(respuesta.status).toBe(400);
    expect(codigoDe(respuesta)).toBe('validacion-fallida');
    expect(JSON.stringify(respuesta.body)).not.toContain('no-es-un-correo');
  });

  it('USR2 — La cookie lleva los atributos de seguridad', async () => {
    const ctx = await arrancar('production');
    const usuario = await crearUsuario(ctx, 'admin');

    const cookie = cookieDeSesion((await iniciarSesion(ctx, usuario.email)).headers['set-cookie']);

    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; SameSite=Strict/);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).not.toMatch(/Expires|Max-Age/i);
  });

  it('USR2 — En desarrollo la cookie no exige HTTPS', async () => {
    const ctx = await arrancar('development');
    const usuario = await crearUsuario(ctx, 'admin');

    const cookie = cookieDeSesion((await iniciarSesion(ctx, usuario.email)).headers['set-cookie']);

    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Strict/);
    expect(cookie).not.toMatch(/Secure/);
  });

  it('USR2 — La cookie solo contiene el identificador de la sesión', async () => {
    const ctx = await arrancar();
    const usuario = await crearUsuario(ctx, 'admin');

    const valor = valorDeCookie(cookieDeSesion((await iniciarSesion(ctx, usuario.email)).headers['set-cookie']));

    expect(valor).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(valor).not.toContain(usuario.email);
    expect(valor).not.toContain(usuario.id);
    expect(valor).not.toContain('admin');
  });

  it('USR4 — Cerrar sesión borra la clave y vacía la cookie', async () => {
    const ctx = await arrancar();
    const usuario = await crearUsuario(ctx, 'admin');
    const valor = valorDeCookie(cookieDeSesion((await iniciarSesion(ctx, usuario.email)).headers['set-cookie']));

    const respuesta = await request(ctx.servidor).delete('/api/v1/auth/sesion').set(CSRF).set('cookie', `luxe_sesion=${valor}`);

    expect(respuesta.status).toBe(204);
    expect(await ctx.redis.exists(`sesion:${valor}`)).toBe(0);
    const vaciada = cookieDeSesion(respuesta.headers['set-cookie']);
    expect(vaciada).toMatch(/^luxe_sesion=;/);
    expect(vaciada).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('USR4 — La cookie de una sesión cerrada ya no sirve', async () => {
    const ctx = await arrancar();
    const usuario = await crearUsuario(ctx, 'asesor');
    const valor = valorDeCookie(cookieDeSesion((await iniciarSesion(ctx, usuario.email)).headers['set-cookie']));
    await request(ctx.servidor).delete('/api/v1/auth/sesion').set(CSRF).set('cookie', `luxe_sesion=${valor}`);

    const respuesta = await request(ctx.servidor).get('/api/v1/auth/yo').set('cookie', `luxe_sesion=${valor}`);

    expect(respuesta.status).toBe(401);
  });

  it('USR4 — Cerrar sesión sin sesión también responde 204', async () => {
    const ctx = await arrancar();

    const respuesta = await request(ctx.servidor).delete('/api/v1/auth/sesion').set(CSRF);

    expect(respuesta.status).toBe(204);
  });

  it('USR5 — La sesión válida devuelve el usuario', async () => {
    const ctx = await arrancar();
    const usuario = await crearUsuario(ctx, 'asesor');
    const valor = valorDeCookie(cookieDeSesion((await iniciarSesion(ctx, usuario.email)).headers['set-cookie']));

    const respuesta = await request(ctx.servidor).get('/api/v1/auth/yo').set('cookie', `luxe_sesion=${valor}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ id: usuario.id, nombre: 'Persona del e2e', email: usuario.email, rol: 'asesor' });
  });

  it('USR5 — Sin sesión la consulta se rechaza', async () => {
    const ctx = await arrancar();

    const respuesta = await request(ctx.servidor).get('/api/v1/auth/yo');

    expect(respuesta.status).toBe(401);
    expect(codigoDe(respuesta)).toBe('peticion-no-autenticada');
  });

  it('USR6 — El webhook de Chatwoot sigue respondiendo sin cookie', async () => {
    const ctx = await arrancar();
    const fixture = cargarFixtureChatwoot('mensaje-creado-entrante-texto.json');
    const timestamp = Math.floor((performance.timeOrigin + performance.now()) / 1000);

    const respuesta = await request(ctx.servidor)
      .post('/api/v1/webhooks/chatwoot')
      .set('Content-Type', 'application/json')
      .set('X-Chatwoot-Timestamp', String(timestamp))
      .set('X-Chatwoot-Signature', firmarComoChatwoot(fixture.rawBody, timestamp, SECRETO_WEBHOOK))
      .send(fixture.rawBody.toString('utf8'));

    expect(respuesta.status).toBeGreaterThanOrEqual(200);
    expect(respuesta.status).toBeLessThan(300);
    expect((respuesta.body as { estado?: string }).estado).toMatch(/registrado|duplicado/);
  });

  it('USR6 — `GET /health` sigue respondiendo sin cookie', async () => {
    const ctx = await arrancar();

    const respuesta = await request(ctx.servidor).get('/health');

    expect(respuesta.status).toBe(200);
    expect((respuesta.body as { status?: string }).status).toBe('ok');
  });

  it('API7 — Rol insuficiente rechazado en el servidor', async () => {
    const ctx = await arrancar();
    const asesor = await crearUsuario(ctx, 'asesor');
    const valor = valorDeCookie(cookieDeSesion((await iniciarSesion(ctx, asesor.email)).headers['set-cookie']));

    const respuesta = await request(ctx.servidor)
      .get('/api/v1/fixture-autenticacion/solo-admin')
      .set('cookie', `luxe_sesion=${valor}`);

    expect(respuesta.status).toBe(403);
    expect(respuesta.headers['content-type']).toContain('application/problem+json');
    expect(codigoDe(respuesta)).toBe('rol-insuficiente');
  });

  it('API7 — Request sin autenticar rechazado', async () => {
    const ctx = await arrancar();

    const sinCookie = await request(ctx.servidor).get('/api/v1/fixture-autenticacion/solo-admin');
    const vencida = await request(ctx.servidor)
      .get('/api/v1/fixture-autenticacion/solo-admin')
      .set('cookie', `luxe_sesion=${'v'.repeat(43)}`);

    expect(sinCookie.status).toBe(401);
    expect(codigoDe(sinCookie)).toBe('peticion-no-autenticada');
    expect(vencida.status).toBe(401);
    expect(codigoDe(vencida)).toBe('peticion-no-autenticada');
  });

  it('USR9 — Un inicio de sesión fallido no escribe el correo en los logs', async () => {
    const ctx = await arrancar();
    await crearUsuario(ctx, 'admin');

    await iniciarSesion(ctx, 'admin@ejemplo.co', 'clave-incorrecta-123');

    const logs = ctx.lineasLog.join('');
    expect(logs.length).toBeGreaterThan(0);
    expect(logs).not.toContain('admin@ejemplo.co');
    expect(logs).not.toContain('clave-incorrecta-123');
  });

  it('USR9 — Los logs de una petición no contienen la cookie', async () => {
    const ctx = await arrancar();
    const usuario = await crearUsuario(ctx, 'admin');
    const valor = valorDeCookie(cookieDeSesion((await iniciarSesion(ctx, usuario.email)).headers['set-cookie']));

    await request(ctx.servidor).get('/api/v1/auth/yo').set('cookie', `luxe_sesion=${valor}`);

    const logs = ctx.lineasLog.join('');
    expect(logs).toContain('/api/v1/auth/yo');
    expect(logs).not.toContain(valor);
    expect(logs).not.toContain(usuario.email);
    expect(logs).not.toContain(CONTRASENA);
  });
});
