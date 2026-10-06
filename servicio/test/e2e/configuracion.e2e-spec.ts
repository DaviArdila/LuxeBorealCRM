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

// T9 (fase-12): configuración del negocio por la API, con la app completa y las guardias reales de la 11a (CFG1-CFG5, API7).

const CSRF = { 'x-luxe-csrf': '1' } as const;
const RUTA = '/api/v1/configuracion';
const CLAVES = ['horario_atencion', 'recargo_contraentrega_pct', 'factor_volumetrico', 'llm_techo_mensual_usd', 'llm_estado_techo'];

type OpcionesPinoHttp = Extract<NonNullable<Params['pinoHttp']>, readonly unknown[]>[0];

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
  await ctx.prisma.parametro.deleteMany({ where: { clave: { in: CLAVES } } });
  await ctx.prisma.excepcionHorario.deleteMany();
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
  await asegurarConexion(app.get<ClienteRedis>(REDIS_CLIENTE));
  contexto = { app, servidor: app.getHttpServer(), prisma: app.get(PrismaService) };
  await limpiar(contexto);
  return contexto;
}

function como(ctx: Contexto, sesion: SesionDePrueba) {
  const con = (peticion: request.Test) => peticion.set('cookie', sesion.cookie).set(CSRF);
  return {
    get: (ruta: string) => con(request(ctx.servidor).get(`${RUTA}${ruta}`)),
    post: (ruta: string, cuerpo: unknown) => con(request(ctx.servidor).post(`${RUTA}${ruta}`)).send(cuerpo as object),
    put: (ruta: string, cuerpo: unknown) => con(request(ctx.servidor).put(`${RUTA}${ruta}`)).send(cuerpo as object),
    delete: (ruta: string) => con(request(ctx.servidor).delete(`${RUTA}${ruta}`)),
  };
}

function cuerpoDe(respuesta: { readonly body: unknown }): Record<string, unknown> {
  return respuesta.body as Record<string, unknown>;
}

const DIAS = {
  lun: { desde: '08:00', hasta: '18:00' },
  mar: { desde: '08:00', hasta: '18:00' },
  mie: { desde: '08:00', hasta: '18:00' },
  jue: { desde: '08:00', hasta: '18:00' },
  vie: { desde: '22:00', hasta: '02:00' },
  sab: null,
  dom: null,
};

describe('Configuración del negocio por la API (T9, e2e)', () => {
  it('CFG1 — Un asesor recibe 403 en las rutas de configuración', async () => {
    const ctx = await arrancar();
    const asesor = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'asesor'));

    const respuestas = [
      await asesor.get('/horario'),
      await asesor.put('/horario', { dias: DIAS }),
      await asesor.get('/envios'),
      await asesor.put('/envios', { recargoContraentregaPct: 9, factorVolumetrico: 5000 }),
      await asesor.get('/gasto-llm'),
      await asesor.put('/gasto-llm', { techoMensualUsd: 99 }),
    ];

    expect(respuestas.map((r) => r.status)).toEqual([403, 403, 403, 403, 403, 403]);
    expect(await ctx.prisma.parametro.count({ where: { clave: { in: CLAVES } } })).toBe(0);
  });

  it('CFG1 — Un admin lee el grupo de envíos con los valores vigentes', async () => {
    const ctx = await arrancar();
    const admin = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));
    expect((await admin.put('/envios', { recargoContraentregaPct: 6, factorVolumetrico: 5000 })).status).toBe(200);

    const lectura = await admin.get('/envios');

    expect(lectura.status).toBe(200);
    expect(cuerpoDe(lectura)).toMatchObject({ recargoContraentregaPct: 6, factorVolumetrico: 5000 });
    expect(typeof cuerpoDe(lectura)['actualizado']).toBe('string');
  });

  it('CFG1 — Un grupo con un campo inválido responde 422 con el motivo del campo y no guarda nada', async () => {
    const ctx = await arrancar();
    const admin = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));
    await admin.put('/envios', { recargoContraentregaPct: 5, factorVolumetrico: 4000 });

    const rechazo = await admin.put('/envios', { recargoContraentregaPct: 6, factorVolumetrico: -1 });

    expect(rechazo.status).toBe(422);
    expect(cuerpoDe(rechazo)['codigo']).toBe('configuracion-invalida');
    expect(String(cuerpoDe(rechazo)['detail'])).toContain('factorVolumetrico');
    expect(cuerpoDe(await admin.get('/envios'))['recargoContraentregaPct']).toBe(5);
  });

  it('CFG1 — Los logs de una escritura llevan el grupo y los nombres de los campos, nunca los valores', async () => {
    const ctx = await arrancar();
    const admin = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));

    await admin.put('/envios', { recargoContraentregaPct: 7.77, factorVolumetrico: 6123 });

    const registro = lineasLog.filter((linea) => linea.includes('configuracion.guardada')).join('\n');
    expect(registro).toContain('envios');
    expect(registro).toContain('recargoContraentregaPct');
    expect(registro).not.toContain('7.77');
    expect(registro).not.toContain('6123');
  });

  it('CFG2 — Guardar el horario por día y leerlo; una hora inválida responde 422 nombrando el día', async () => {
    const ctx = await arrancar();
    const admin = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));

    const guardado = await admin.put('/horario', { dias: DIAS });
    const rechazo = await admin.put('/horario', { dias: { ...DIAS, lun: { desde: '25:00', hasta: '18:00' } } });

    expect(guardado.status).toBe(200);
    expect(cuerpoDe(guardado)['dias']).toMatchObject({ lun: { desde: '08:00', hasta: '18:00' }, vie: { desde: '22:00', hasta: '02:00' }, dom: null });
    expect(rechazo.status).toBe(422);
    expect(String(cuerpoDe(rechazo)['detail'])).toContain('lun');
  });

  it('CFG2 — Crear, repetir y borrar una excepción de horario', async () => {
    const ctx = await arrancar();
    const admin = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));

    const creada = await admin.post('/horario/excepciones', { fecha: '2026-12-25', motivo: 'Navidad' });
    const repetida = await admin.post('/horario/excepciones', { fecha: '2026-12-25', motivo: 'otra' });
    const listada = cuerpoDe(await admin.get('/horario'))['excepciones'];
    const borrada = await admin.delete('/horario/excepciones/2026-12-25');
    const ausente = await admin.delete('/horario/excepciones/2026-12-25');

    expect(creada.status).toBe(201);
    expect(repetida.status).toBe(409);
    expect(cuerpoDe(repetida)['codigo']).toBe('excepcion-duplicada');
    expect(listada).toEqual([{ fecha: '2026-12-25', motivo: 'Navidad' }]);
    expect(borrada.status).toBe(204);
    expect(ausente.status).toBe(404);
  });

  it('CFG4 — El techo se guarda y el estado del gateway no se puede escribir', async () => {
    const ctx = await arrancar();
    const admin = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));
    const estado = { mes: '2026-10', gastoUsd: 12, techoUsd: 10, avisoEmitido: true, bloqueado: true };
    await ctx.prisma.parametro.create({ data: { clave: 'llm_estado_techo', valor: estado } });

    const guardado = await admin.put('/gasto-llm', { techoMensualUsd: 20 });
    const intento = await admin.put('/gasto-llm', { techoMensualUsd: 30, estado: { bloqueado: false } });

    expect(guardado.status).toBe(200);
    expect(cuerpoDe(guardado)).toMatchObject({ techoMensualUsd: 20, gastoMesUsd: 12, estado: { bloqueado: true } });
    expect(intento.status).toBe(422);
    expect(cuerpoDe(intento)['codigo']).toBe('configuracion-invalida');
    expect((await ctx.prisma.parametro.findUnique({ where: { clave: 'llm_estado_techo' } }))?.valor).toEqual(estado);
    expect(cuerpoDe(await admin.get('/gasto-llm'))['techoMensualUsd']).toBe(20);
  });

  it('CFG5 — Guardar los envíos descarta la copia del catálogo en Redis', async () => {
    const ctx = await arrancar();
    const admin = como(ctx, await iniciarSesionComo(ctx.servidor, ctx.prisma, 'admin'));
    const redis = ctx.app.get<ClienteRedis>(REDIS_CLIENTE);
    const antes = Number((await redis.get('catalogo:version')) ?? '0');

    expect((await admin.put('/envios', { recargoContraentregaPct: 6, factorVolumetrico: 4000 })).status).toBe(200);

    expect(Number(await redis.get('catalogo:version'))).toBe(antes + 1);
  });
});
