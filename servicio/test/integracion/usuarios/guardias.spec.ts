import { randomUUID } from 'node:crypto';
import { Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { Publico, Roles, UsuariosModule } from '../../../src/modulos/usuarios/index.js';
import { configurarAplicacion, OPCIONES_APLICACION } from '../../../src/configurar-aplicacion.js';
import {
  CONFIGURACION,
  ConfiguracionModule,
  cargarConfiguracion,
} from '../../../src/plataforma/config/index.js';
import { ErroresModule } from '../../../src/plataforma/errores/index.js';
import { ObservabilidadModule } from '../../../src/plataforma/observabilidad/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { asegurarConexion, REDIS_CLIENTE, RedisModule, type ClienteRedis } from '../../../src/plataforma/redis/index.js';
import { CLOCK, RelojModule, type Clock } from '../../../src/plataforma/reloj/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

// T5 (fase-11a): guardias globales de CSRF, sesión y roles contra Postgres y Redis reales, con un controlador
// fixture que solo existe en este test (USR3, USR6, USR7, D2-D4).

@Controller('fixture-guardias')
class FixtureGuardiasController {
  @Get('abierta')
  @Publico()
  abierta(): { ok: true } {
    return { ok: true };
  }

  @Post('abierta')
  @Publico()
  @HttpCode(200)
  mutarAbierta(): { ok: true } {
    return { ok: true };
  }

  @Get('protegida')
  protegida(): { ok: true } {
    return { ok: true };
  }

  @Delete('protegida')
  @HttpCode(204)
  borrarProtegida(): void {}

  @Get('admin')
  @Roles('admin')
  admin(): { ok: true } {
    return { ok: true };
  }
}

let app: NestExpressApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function crearContexto() {
  const configuracion = cargarConfiguracion({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: urlPostgresDePrueba(),
    REDIS_URL: urlRedisDePrueba(),
  });
  const modulo = await Test.createTestingModule({
    imports: [ConfiguracionModule, RelojModule, ObservabilidadModule, ErroresModule, PrismaModule, RedisModule, UsuariosModule],
    controllers: [FixtureGuardiasController],
  })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracion)
    .compile();
  app = modulo.createNestApplication<NestExpressApplication>(OPCIONES_APLICACION);
  configurarAplicacion(app);
  await app.init();
  const prisma = app.get(PrismaService);
  const redis = app.get<ClienteRedis>(REDIS_CLIENTE);
  await asegurarConexion(redis);
  return { servidor: app.getHttpServer(), prisma, redis, clock: app.get<Clock>(CLOCK) };
}

function codigoDe(respuesta: { readonly body: unknown }): unknown {
  return (respuesta.body as { readonly codigo?: unknown }).codigo;
}

/** Siembra un usuario y una sesión en Redis tal como las deja `IniciarSesion`, sin pasar por el login (T6). */
async function sembrarSesion(
  contexto: Awaited<ReturnType<typeof crearContexto>>,
  rol: 'admin' | 'asesor',
  opciones: { readonly creada?: Date } = {},
): Promise<{ usuarioId: string; cookie: string; clave: string }> {
  const usuario = await contexto.prisma.usuario.create({
    data: { email: `persona-${randomUUID()}@ejemplo.co`, nombre: 'Persona', passwordHash: 'h', rol },
  });
  const id = randomUUID().replaceAll('-', '').padEnd(43, 'x');
  const creada = (opciones.creada ?? contexto.clock.ahora()).toISOString();
  const clave = `sesion:${id}`;
  await contexto.redis.set(clave, JSON.stringify({ usuarioId: usuario.id, creada, ultimaActividad: creada }), 'EX', 600);
  return { usuarioId: usuario.id, cookie: `luxe_sesion=${id}`, clave };
}

describe('Guardias globales de usuarios (T5, integración)', () => {
  it('una ruta @Publico() responde sin cookie', async () => {
    const contexto = await crearContexto();

    const respuesta = await request(contexto.servidor).get('/api/v1/fixture-guardias/abierta');

    expect(respuesta.status).toBe(200);
  });

  it('USR6 — Una ruta protegida sin sesión se rechaza', async () => {
    const contexto = await crearContexto();

    const respuesta = await request(contexto.servidor).get('/api/v1/fixture-guardias/protegida');

    expect(respuesta.status).toBe(401);
    expect(respuesta.headers['content-type']).toContain('application/problem+json');
    expect(codigoDe(respuesta)).toBe('peticion-no-autenticada');
  });

  it('una cookie con un id desconocido se rechaza igual que sin cookie', async () => {
    const contexto = await crearContexto();

    const respuesta = await request(contexto.servidor)
      .get('/api/v1/fixture-guardias/protegida')
      .set('cookie', `luxe_sesion=${'z'.repeat(43)}`);

    expect(respuesta.status).toBe(401);
    expect(codigoDe(respuesta)).toBe('peticion-no-autenticada');
  });

  it('USR3 — La actividad renueva el vencimiento', async () => {
    const contexto = await crearContexto();
    const { cookie, clave } = await sembrarSesion(contexto, 'asesor');
    await contexto.redis.expire(clave, 20 * 60); // última petición hace 700 de 720 minutos

    const respuesta = await request(contexto.servidor).get('/api/v1/fixture-guardias/protegida').set('cookie', cookie);

    expect(respuesta.status).toBe(200);
    expect(await contexto.redis.ttl(clave)).toBeGreaterThan(720 * 60 - 5);
  });

  it('USR3 — Una sesión inactiva vence', async () => {
    const contexto = await crearContexto();
    const { cookie, clave } = await sembrarSesion(contexto, 'asesor');
    await contexto.redis.pexpire(clave, 1);
    await new Promise((resolver) => setTimeout(resolver, 20));

    const respuesta = await request(contexto.servidor).get('/api/v1/fixture-guardias/protegida').set('cookie', cookie);

    expect(respuesta.status).toBe(401);
    expect(codigoDe(respuesta)).toBe('peticion-no-autenticada');
  });

  it('una sesión creada hace más de SESION_DURACION_MAX_H horas se rechaza y se borra', async () => {
    const contexto = await crearContexto();
    const { cookie, clave } = await sembrarSesion(contexto, 'admin', {
      creada: new Date('2026-01-01T00:00:00Z'),
    });

    const respuesta = await request(contexto.servidor).get('/api/v1/fixture-guardias/protegida').set('cookie', cookie);

    expect(respuesta.status).toBe(401);
    expect(await contexto.redis.exists(clave)).toBe(0);
  });

  it('USR6 — Un asesor no entra a una ruta de admin', async () => {
    const contexto = await crearContexto();
    const { cookie } = await sembrarSesion(contexto, 'asesor');

    const respuesta = await request(contexto.servidor).get('/api/v1/fixture-guardias/admin').set('cookie', cookie);

    expect(respuesta.status).toBe(403);
    expect(respuesta.headers['content-type']).toContain('application/problem+json');
    expect(codigoDe(respuesta)).toBe('rol-insuficiente');
  });

  it('un admin entra a la ruta de admin', async () => {
    const contexto = await crearContexto();
    const { cookie } = await sembrarSesion(contexto, 'admin');

    const respuesta = await request(contexto.servidor).get('/api/v1/fixture-guardias/admin').set('cookie', cookie);

    expect(respuesta.status).toBe(200);
  });

  it('USR6 — Un usuario desactivado pierde el acceso en su siguiente petición', async () => {
    const contexto = await crearContexto();
    const { usuarioId, cookie, clave } = await sembrarSesion(contexto, 'admin');
    await contexto.prisma.usuario.update({ where: { id: usuarioId }, data: { activo: false } });

    const respuesta = await request(contexto.servidor).get('/api/v1/fixture-guardias/protegida').set('cookie', cookie);

    expect(respuesta.status).toBe(401);
    expect(await contexto.redis.exists(clave)).toBe(0);
  });

  it('USR6 — Un cambio de rol aplica sin volver a iniciar sesión', async () => {
    const contexto = await crearContexto();
    const { usuarioId, cookie } = await sembrarSesion(contexto, 'admin');
    await contexto.prisma.usuario.update({ where: { id: usuarioId }, data: { rol: 'asesor' } });

    const respuesta = await request(contexto.servidor).get('/api/v1/fixture-guardias/admin').set('cookie', cookie);

    expect(respuesta.status).toBe(403);
  });

  it('USR7 — Una mutación sin el encabezado se rechaza', async () => {
    const contexto = await crearContexto();
    const { cookie, clave } = await sembrarSesion(contexto, 'admin');

    const respuesta = await request(contexto.servidor).delete('/api/v1/fixture-guardias/protegida').set('cookie', cookie);

    expect(respuesta.status).toBe(403);
    expect(codigoDe(respuesta)).toBe('encabezado-csrf-ausente');
    expect(await contexto.redis.exists(clave)).toBe(1);
  });

  it('una mutación con el encabezado y la sesión pasa', async () => {
    const contexto = await crearContexto();
    const { cookie } = await sembrarSesion(contexto, 'admin');

    const respuesta = await request(contexto.servidor)
      .delete('/api/v1/fixture-guardias/protegida')
      .set('cookie', cookie)
      .set('x-luxe-csrf', '1');

    expect(respuesta.status).toBe(204);
  });

  it('USR7 — El inicio de sesión exige el encabezado', async () => {
    // El endpoint real llega en T6; aquí basta una mutación @Publico(): la guardia CSRF corre igual.
    const contexto = await crearContexto();

    const sin = await request(contexto.servidor).post('/api/v1/fixture-guardias/abierta');
    const con = await request(contexto.servidor).post('/api/v1/fixture-guardias/abierta').set('x-luxe-csrf', '1');

    expect(sin.status).toBe(403);
    expect(codigoDe(sin)).toBe('encabezado-csrf-ausente');
    expect(con.status).toBe(200);
  });

  it('el encabezado anti-CSRF debe valer 1', async () => {
    const contexto = await crearContexto();

    const respuesta = await request(contexto.servidor).post('/api/v1/fixture-guardias/abierta').set('x-luxe-csrf', 'si');

    expect(respuesta.status).toBe(403);
  });

  it('USR7 — Una lectura no exige el encabezado', async () => {
    const contexto = await crearContexto();
    const { cookie } = await sembrarSesion(contexto, 'asesor');

    const respuesta = await request(contexto.servidor).get('/api/v1/fixture-guardias/protegida').set('cookie', cookie);

    expect(respuesta.status).toBe(200);
  });
});
