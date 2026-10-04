import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RepositorioParametroAgentePrisma } from '../../../src/modulos/agente/infraestructura/prisma/repositorio-parametro-agente-prisma.js';
import { RepositorioParametroCatalogoPrisma } from '../../../src/modulos/catalogo/infraestructura/repositorio-parametro-prisma.js';
import { RepositorioParametroConversacionesPrisma } from '../../../src/modulos/conversaciones/infraestructura/prisma/repositorio-parametro-conversaciones-prisma.js';
import { RepositorioParametroLlmPrisma } from '../../../src/modulos/llm/infraestructura/prisma/repositorio-parametro-llm-prisma.js';
import { CATALOGO_REAL } from '../../../src/modulos/mensajes-fijos/catalogo-real.js';
import { GuardarMensajeFijo, ListarMensajesFijos, MensajesFijosModule, SembrarMensajesFijos } from '../../../src/modulos/mensajes-fijos/index.js';
import { RepositorioMensajesFijosPrisma } from '../../../src/modulos/mensajes-fijos/infraestructura/prisma/repositorio-mensajes-fijos-prisma.js';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { PrismaService } from '../../../src/plataforma/prisma/index.js';
import { CLOCK, RelojModule } from '../../../src/plataforma/reloj/index.js';
import { ClockFalso } from '../../fakes/clock-falso.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

// T3 (fase-11b): mensajes fijos contra Postgres real (CFN1-CFN3, D3, D5).

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
    .compile();
  const prisma = modulo.get(PrismaService);
  await prisma.parametro.deleteMany({ where: { clave: { in: [...CLAVES, AJENA] } } });
  return {
    clock,
    prisma,
    listar: modulo.get(ListarMensajesFijos),
    guardar: modulo.get(GuardarMensajeFijo),
    sembrar: modulo.get(SembrarMensajesFijos),
    repositorio: new RepositorioMensajesFijosPrisma(prisma),
  };
}

beforeEach(() => {
  modulo = undefined;
});

afterEach(async () => {
  await modulo?.get(PrismaService).parametro.deleteMany({ where: { clave: { in: [...CLAVES, AJENA] } } });
  await modulo?.close();
});

describe('RepositorioMensajesFijosPrisma (T3, integración)', () => {
  it('leer devuelve solo las claves pedidas que tienen fila, con su valor y su fecha', async () => {
    const { repositorio, prisma } = await contexto();
    await prisma.parametro.create({ data: { clave: 'mensaje_handoff', valor: 'Hola', actualizado: instante } });
    await prisma.parametro.create({ data: { clave: AJENA, valor: 10 } });

    const filas = await repositorio.leer(['mensaje_handoff', 'mensaje_techo_gasto']);

    expect([...filas.keys()]).toEqual(['mensaje_handoff']);
    expect(filas.get('mensaje_handoff')).toEqual({ valor: 'Hola', actualizado: instante });
  });

  it('guardar crea la fila y después la reemplaza con la fecha nueva', async () => {
    const { repositorio, prisma } = await contexto();

    await repositorio.guardar('mensaje_handoff', 'Uno', instante);
    const despues = new Date('2026-10-05T09:00:00.000Z');
    await repositorio.guardar('mensaje_handoff', 'Dos', despues);

    expect(await prisma.parametro.findUniqueOrThrow({ where: { clave: 'mensaje_handoff' } })).toMatchObject({ valor: 'Dos', actualizado: despues });
  });

  it('insertarFaltantes inserta solo las que faltan y no toca las existentes', async () => {
    const { repositorio, prisma } = await contexto();
    await prisma.parametro.create({ data: { clave: 'mensaje_handoff', valor: 'Del dueño', actualizado: instante } });

    const insertadas = await repositorio.insertarFaltantes(
      [{ clave: 'mensaje_handoff', texto: 'Respaldo' }, { clave: 'mensaje_techo_gasto', texto: 'Otro respaldo' }],
      new Date('2026-10-06T00:00:00.000Z'),
    );

    expect(insertadas).toBe(1);
    expect(await prisma.parametro.findUniqueOrThrow({ where: { clave: 'mensaje_handoff' } })).toMatchObject({ valor: 'Del dueño', actualizado: instante });
  });
});

describe('Mensajes fijos de punta a punta sobre parametro (T3, integración)', () => {
  it('CFN1 — La lista trae los diez mensajes: handoff en la base y techo de gasto con el respaldo de llm', async () => {
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

  it('CFN2 — Una clave desconocida no escribe nada en parametro', async () => {
    const { guardar, prisma } = await contexto();

    const resultado = await guardar.ejecutar(AJENA, 'Un texto cualquiera');

    expect(resultado).toEqual({ guardado: false, razon: 'desconocida' });
    expect(await prisma.parametro.findUnique({ where: { clave: AJENA } })).toBeNull();
  });

  it('CFN2 — Un texto inválido no cambia la fila vigente', async () => {
    const { guardar, prisma } = await contexto();
    await guardar.ejecutar('mensaje_handoff', 'Texto vigente.');

    const resultado = await guardar.ejecutar('mensaje_handoff', 'Te sale en $ 120.000');

    expect(resultado).toMatchObject({ guardado: false, razon: 'invalido' });
    expect((await prisma.parametro.findUniqueOrThrow({ where: { clave: 'mensaje_handoff' } })).valor).toBe('Texto vigente.');
  });

  it('CFN3 — La semilla llena una base vacía con los textos de respaldo y no se pisa a sí misma', async () => {
    const { sembrar, prisma, clock } = await contexto();

    const primera = await sembrar.ejecutar();
    const filas = await prisma.parametro.findMany({ where: { clave: { in: CLAVES } }, orderBy: { clave: 'asc' } });
    clock.avanzar(24 * 60 * 60 * 1000);
    const segunda = await sembrar.ejecutar();
    const despues = await prisma.parametro.findMany({ where: { clave: { in: CLAVES } }, orderBy: { clave: 'asc' } });

    expect(primera).toEqual({ insertadas: 10, existentes: 0 });
    expect(filas).toHaveLength(10);
    for (const fila of filas) {
      expect(fila.valor, fila.clave).toBe(CATALOGO_REAL.find((m) => m.clave === fila.clave)?.textoRespaldo);
    }
    expect(segunda).toEqual({ insertadas: 0, existentes: 10 });
    expect(despues).toEqual(filas);
  });

  it('CFN3 — La semilla no pisa un texto editado', async () => {
    const { sembrar, guardar, prisma } = await contexto();
    await guardar.ejecutar('mensaje_handoff', 'Texto del dueño.');

    const resultado = await sembrar.ejecutar();

    expect(resultado).toEqual({ insertadas: 9, existentes: 1 });
    expect((await prisma.parametro.findUniqueOrThrow({ where: { clave: 'mensaje_handoff' } })).valor).toBe('Texto del dueño.');
  });

  it('lo que se siembra es lo que lee cada módulo dueño, y lo que se guarda rige en su siguiente lectura (D3)', async () => {
    const { sembrar, guardar, prisma } = await contexto();
    const agente = new RepositorioParametroAgentePrisma(prisma);
    const conversaciones = new RepositorioParametroConversacionesPrisma(prisma);
    const catalogo = new RepositorioParametroCatalogoPrisma(prisma);
    const llm = new RepositorioParametroLlmPrisma(prisma);
    const respaldo = (clave: string) => CATALOGO_REAL.find((m) => m.clave === clave)?.textoRespaldo;

    const antes = {
      agente: await agente.obtenerTexto('mensaje_handoff'),
      espera: await conversaciones.obtenerMensajeEsperaHandoff(),
      cobertura: await catalogo.obtenerMensajeFueraCobertura(),
      techo: await llm.obtenerMensajeTechoGasto(),
    };
    await sembrar.ejecutar();
    const sembrado = {
      agente: await agente.obtenerTexto('mensaje_handoff'),
      espera: await conversaciones.obtenerMensajeEsperaHandoff(),
      cobertura: await catalogo.obtenerMensajeFueraCobertura(),
      techo: await llm.obtenerMensajeTechoGasto(),
    };
    await guardar.ejecutar('mensaje_handoff', 'Ya te comunico con un asesor.');
    await guardar.ejecutar('mensaje_espera_handoff', 'Seguimos contigo.');
    await guardar.ejecutar('mensaje_fuera_cobertura', 'Aún no llegamos allá.');
    await guardar.ejecutar('mensaje_techo_gasto', 'Te atiende una persona.');

    expect(sembrado).toEqual(antes);
    expect(antes).toEqual({
      agente: respaldo('mensaje_handoff'),
      espera: respaldo('mensaje_espera_handoff'),
      cobertura: respaldo('mensaje_fuera_cobertura'),
      techo: respaldo('mensaje_techo_gasto'),
    });
    expect(await agente.obtenerTexto('mensaje_handoff')).toBe('Ya te comunico con un asesor.');
    expect(await conversaciones.obtenerMensajeEsperaHandoff()).toBe('Seguimos contigo.');
    expect(await catalogo.obtenerMensajeFueraCobertura()).toBe('Aún no llegamos allá.');
    expect(await llm.obtenerMensajeTechoGasto()).toBe('Te atiende una persona.');
  });
});
