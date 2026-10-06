import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AdministrarTextosDelSistema, TEXTOS_ASISTENTE, type TextosAsistente } from '../../../src/modulos/asistente/index.js';
import { VERSION_ASISTENTE } from '../../../src/modulos/asistente/puertos/version-asistente.js';
import { CATALOGO_REAL } from '../../../src/modulos/mensajes-fijos/catalogo-real.js';
import { GuardarMensajeFijo, ListarMensajesFijos, MensajesFijosModule, SembrarMensajesFijos } from '../../../src/modulos/mensajes-fijos/index.js';
import { RepositorioMensajesFijosAsistente } from '../../../src/modulos/mensajes-fijos/infraestructura/repositorio-mensajes-fijos-asistente.js';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { PrismaService } from '../../../src/plataforma/prisma/index.js';
import { asegurarConexion, REDIS_CLIENTE, type ClienteRedis } from '../../../src/plataforma/redis/index.js';
import { CLOCK, RelojModule } from '../../../src/plataforma/reloj/index.js';
import { ClockFalso } from '../../fakes/clock-falso.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { limpiarCasos } from '../../soporte/textos-asistente.js';
import { VersionAsistenteDePrueba } from '../../soporte/version-asistente-de-prueba.js';

// T3 (fase-11b) / T5 (fase-12): mensajes fijos contra Postgres real (CFN1-CFN3, D3, D5), ahora sobre los casos del sistema del
// asistente.

const CLAVES = CATALOGO_REAL.map((m) => m.clave);
const AJENA = 'llm_techo_mensual_usd';
const instante = new Date('2026-10-04T15:00:00.000Z');

let modulo: TestingModule | undefined;

async function contexto() {
  const clock = new ClockFalso(instante);
  const configuracion = cargarConfiguracion({ NODE_ENV: 'test', DATABASE_URL: urlPostgresDePrueba(), REDIS_URL: urlRedisDePrueba() });
  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, RelojModule, MensajesFijosModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracion)
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(VERSION_ASISTENTE)
    .useFactory({ factory: (redis: ClienteRedis) => new VersionAsistenteDePrueba(redis), inject: [REDIS_CLIENTE] })
    .compile();
  const prisma = modulo.get(PrismaService);
  await limpiarCasos(prisma);
  await prisma.parametro.deleteMany({ where: { clave: AJENA } });
  const version = modulo.get<VersionAsistenteDePrueba>(VERSION_ASISTENTE);
  const redis = modulo.get<ClienteRedis>(REDIS_CLIENTE);
  await asegurarConexion(redis);
  await redis.del(version.claveDePrueba);
  return {
    clock,
    prisma,
    listar: modulo.get(ListarMensajesFijos),
    guardar: modulo.get(GuardarMensajeFijo),
    sembrar: modulo.get(SembrarMensajesFijos),
    repositorio: new RepositorioMensajesFijosAsistente(modulo.get(AdministrarTextosDelSistema, { strict: false })),
    textos: modulo.get<TextosAsistente>(TEXTOS_ASISTENTE, { strict: false }),
  };
}

beforeEach(() => {
  modulo = undefined;
});

afterEach(async () => {
  if (modulo !== undefined) {
    const prisma = modulo.get(PrismaService);
    await limpiarCasos(prisma);
    await prisma.parametro.deleteMany({ where: { clave: AJENA } });
  }
  await modulo?.close();
});

describe('RepositorioMensajesFijosAsistente (T3, integración)', () => {
  it('leer devuelve solo las claves pedidas que tienen caso, con su texto y su fecha', async () => {
    const { repositorio, prisma } = await contexto();
    await repositorio.guardar('mensaje_handoff', 'Hola');
    await prisma.parametro.create({ data: { clave: AJENA, valor: 10 } });

    const filas = await repositorio.leer(['mensaje_handoff', 'mensaje_techo_gasto']);

    expect([...filas.keys()]).toEqual(['mensaje_handoff']);
    expect(filas.get('mensaje_handoff')).toEqual({ valor: 'Hola', actualizado: instante });
  });

  it('guardar crea el caso y después lo reemplaza con la fecha nueva', async () => {
    const { repositorio, prisma, clock } = await contexto();

    await repositorio.guardar('mensaje_handoff', 'Uno');
    clock.avanzar(17 * 60 * 60 * 1000);
    await repositorio.guardar('mensaje_handoff', 'Dos');

    expect(await prisma.casoAsistente.findUniqueOrThrow({ where: { claveSistema: 'mensaje_handoff' } })).toMatchObject({
      texto: 'Dos',
      actualizado: clock.ahora(),
      disparador: 'evento',
    });
    expect(await prisma.casoAsistente.count()).toBe(1);
  });

  it('insertarFaltantes inserta solo las que faltan y no toca las existentes', async () => {
    const { repositorio, prisma } = await contexto();
    await repositorio.guardar('mensaje_handoff', 'Del dueño');

    const insertadas = await repositorio.insertarFaltantes([
      { clave: 'mensaje_handoff', texto: 'Respaldo' },
      { clave: 'mensaje_techo_gasto', texto: 'Otro respaldo' },
    ]);

    expect(insertadas).toBe(1);
    expect(await prisma.casoAsistente.findUniqueOrThrow({ where: { claveSistema: 'mensaje_handoff' } })).toMatchObject({ texto: 'Del dueño', actualizado: instante });
  });
});

describe('Mensajes fijos de punta a punta sobre los casos del asistente (T3, integración)', () => {
  it('CFN1 — La lista trae los diez mensajes: handoff en la base y techo de gasto con el respaldo', async () => {
    const { listar, guardar } = await contexto();
    await guardar.ejecutar('mensaje_handoff', 'Ya te comunico con un asesor.');

    const mensajes = await listar.ejecutar();

    expect(mensajes).toHaveLength(10);
    expect(mensajes.find((m) => m.clave === 'mensaje_handoff')).toMatchObject({ origen: 'base', texto: 'Ya te comunico con un asesor.', actualizado: instante.toISOString() });
    expect(mensajes.find((m) => m.clave === 'mensaje_techo_gasto')).toMatchObject({
      origen: 'respaldo',
      actualizado: null,
      texto: CATALOGO_REAL.find((m) => m.clave === 'mensaje_techo_gasto')?.textoRespaldo,
    });
  });

  it('CFN1 — Una clave fuera de la lista no aparece', async () => {
    const { listar, prisma } = await contexto();
    await prisma.parametro.create({ data: { clave: AJENA, valor: 10 } });

    expect((await listar.ejecutar()).map((m) => m.clave)).not.toContain(AJENA);
  });

  it('CFN2 — Una clave desconocida no escribe nada', async () => {
    const { guardar, prisma } = await contexto();

    const resultado = await guardar.ejecutar(AJENA, 'Un texto cualquiera');

    expect(resultado).toEqual({ guardado: false, razon: 'desconocida' });
    expect(await prisma.parametro.findUnique({ where: { clave: AJENA } })).toBeNull();
    expect(await prisma.casoAsistente.count()).toBe(0);
  });

  it('CFN2 — Un texto inválido no cambia el caso vigente', async () => {
    const { guardar, prisma } = await contexto();
    await guardar.ejecutar('mensaje_handoff', 'Texto vigente.');

    const resultado = await guardar.ejecutar('mensaje_handoff', 'Te sale en $ 120.000');

    expect(resultado).toMatchObject({ guardado: false, razon: 'invalido' });
    expect((await prisma.casoAsistente.findUniqueOrThrow({ where: { claveSistema: 'mensaje_handoff' } })).texto).toBe('Texto vigente.');
  });

  it('CFN3 — La semilla llena una base vacía con los textos de respaldo y no se pisa a sí misma', async () => {
    const { sembrar, prisma, clock } = await contexto();

    const primera = await sembrar.ejecutar();
    const filas = await prisma.casoAsistente.findMany({ where: { claveSistema: { in: CLAVES } }, orderBy: { claveSistema: 'asc' } });
    clock.avanzar(24 * 60 * 60 * 1000);
    const segunda = await sembrar.ejecutar();
    const despues = await prisma.casoAsistente.findMany({ where: { claveSistema: { in: CLAVES } }, orderBy: { claveSistema: 'asc' } });

    expect(primera).toEqual({ insertadas: 10, existentes: 0 });
    expect(filas).toHaveLength(10);
    for (const fila of filas) {
      expect(fila.texto, fila.claveSistema ?? '').toBe(CATALOGO_REAL.find((m) => m.clave === fila.claveSistema)?.textoRespaldo);
    }
    expect(segunda).toEqual({ insertadas: 0, existentes: 10 });
    expect(despues).toEqual(filas);
  });

  it('CFN3 — La semilla no pisa un texto editado', async () => {
    const { sembrar, guardar, prisma } = await contexto();
    await guardar.ejecutar('mensaje_handoff', 'Texto del dueño.');

    const resultado = await sembrar.ejecutar();

    expect(resultado).toEqual({ insertadas: 9, existentes: 1 });
    expect((await prisma.casoAsistente.findUniqueOrThrow({ where: { claveSistema: 'mensaje_handoff' } })).texto).toBe('Texto del dueño.');
  });

  it('lo que se siembra es lo que lee el puerto de textos, y lo que se guarda rige en su siguiente lectura (D3)', async () => {
    const { sembrar, guardar, textos } = await contexto();
    const respaldo = (clave: string) => CATALOGO_REAL.find((m) => m.clave === clave)?.textoRespaldo;
    const claves = ['mensaje_handoff', 'mensaje_espera_handoff', 'mensaje_fuera_cobertura', 'mensaje_techo_gasto'] as const;
    const leer = async (): Promise<Record<string, string>> => {
      const leidos: Record<string, string> = {};
      for (const clave of claves) leidos[clave] = await textos.textoDelSistema(clave);
      return leidos;
    };

    const antes = await leer();
    await sembrar.ejecutar();
    const sembrado = await leer();
    await guardar.ejecutar('mensaje_handoff', 'Ya te comunico con un asesor.');
    await guardar.ejecutar('mensaje_espera_handoff', 'Seguimos contigo.');
    await guardar.ejecutar('mensaje_fuera_cobertura', 'Aún no llegamos allá.');
    await guardar.ejecutar('mensaje_techo_gasto', 'Te atiende una persona.');

    expect(sembrado).toEqual(antes);
    expect(antes).toEqual(Object.fromEntries(claves.map((c) => [c, respaldo(c)])));
    expect(await leer()).toEqual({
      mensaje_handoff: 'Ya te comunico con un asesor.',
      mensaje_espera_handoff: 'Seguimos contigo.',
      mensaje_fuera_cobertura: 'Aún no llegamos allá.',
      mensaje_techo_gasto: 'Te atiende una persona.',
    });
  });
});
