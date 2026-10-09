import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { AdministrarConfiguracion } from '../../../src/modulos/configuracion/aplicacion/administrar-configuracion.js';
import { RepositorioConfiguracionPrisma } from '../../../src/modulos/configuracion/infraestructura/repositorio-configuracion-prisma.js';
import { ClaveFueraDelRegistro } from '../../../src/modulos/configuracion/puertos/repositorio-configuracion.js';
import { HorarioAtencion } from '../../../src/modulos/horario/aplicacion/horario-atencion.js';
import { RepositorioHorarioPrisma } from '../../../src/modulos/horario/infraestructura/repositorio-horario-prisma.js';
import { RepositorioParametroCatalogoPrisma } from '../../../src/modulos/catalogo/infraestructura/repositorio-parametro-prisma.js';
import { textoDeRespaldo } from '../../../src/modulos/asistente/index.js';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { ClockSistema, type Clock } from '../../../src/plataforma/reloj/index.js';
import { fijarTextosDelSistema, limpiarCasos, textosSinCopia } from '../../soporte/textos-asistente.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

// Fase 12, T9: configuración del negocio contra Postgres real (CFG2, CFG3, CFG4, CFG6).

let modulo: TestingModule | undefined;
const CLAVES = ['horario_atencion', 'recargo_contraentrega_pct', 'factor_volumetrico', 'llm_techo_mensual_usd', 'llm_estado_techo'];

async function limpiar(prisma: PrismaService): Promise<void> {
  await prisma.parametro.deleteMany({ where: { clave: { in: CLAVES } } });
  await prisma.excepcionHorario.deleteMany();
}

afterEach(async () => {
  if (modulo !== undefined) await limpiar(modulo.get(PrismaService));
  await modulo?.close();
  modulo = undefined;
});

async function contexto() {
  Logger.overrideLogger(false);
  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(cargarConfiguracion({ NODE_ENV: 'test', DATABASE_URL: urlPostgresDePrueba(), REDIS_URL: urlRedisDePrueba() }))
    .compile();
  const prisma = modulo.get(PrismaService);
  await limpiar(prisma);
  const repositorio = new RepositorioConfiguracionPrisma(prisma);
  const reloj = new ClockSistema();
  const casos = new AdministrarConfiguracion(repositorio, { invalidarCatalogo: () => Promise.resolve() }, reloj);
  const horarioEn = (instante: string) => {
    const fijo: Clock = { ahora: () => new Date(instante) };
    return new HorarioAtencion(new RepositorioHorarioPrisma(prisma), fijo);
  };
  return { prisma, repositorio, casos, horarioEn };
}

const SEMANA = {
  lun: { desde: '08:00', hasta: '18:00' },
  mar: { desde: '08:00', hasta: '18:00' },
  mie: { desde: '08:00', hasta: '18:00' },
  jue: { desde: '08:00', hasta: '18:00' },
  vie: { desde: '22:00', hasta: '02:00' },
  sab: null,
  dom: null,
} as const;

// 2026-10-05 es lunes; 10:00 hora de Bogotá = 15:00Z. 2026-10-11 es domingo.
const LUNES_10_BOGOTA = '2026-10-05T15:00:00.000Z';
const DOMINGO_10_BOGOTA = '2026-10-11T15:00:00.000Z';
const VIERNES_23_BOGOTA = '2026-10-10T04:00:00.000Z';

describe('Horario por día contra Postgres (CFG2)', () => {
  it('CFG2 — Guardar el horario por día: el módulo horario evalúa el lunes dentro y el domingo fuera', async () => {
    const { casos, horarioEn } = await contexto();

    expect((await casos.guardarHorario(SEMANA)).ok).toBe(true);

    expect(await horarioEn(LUNES_10_BOGOTA).estaDentroDeHorario()).toBe(true);
    expect(await horarioEn(DOMINGO_10_BOGOTA).estaDentroDeHorario()).toBe(false);
  });

  it('CFG2 — Un rango que cruza la medianoche se guarda y el módulo horario lo evalúa como válido', async () => {
    const { casos, horarioEn } = await contexto();
    await casos.guardarHorario(SEMANA);

    expect(await horarioEn(VIERNES_23_BOGOTA).estaDentroDeHorario()).toBe(true);
  });

  it('CFG2 — Una excepción deja el día fuera de horario mientras exista', async () => {
    const { casos, horarioEn } = await contexto();
    await casos.guardarHorario(SEMANA);

    expect(await casos.crearExcepcion('2026-10-05', 'Festivo')).toEqual({ ok: true });
    expect(await horarioEn(LUNES_10_BOGOTA).estaDentroDeHorario()).toBe(false);
    expect((await casos.obtenerHorario()).excepciones).toEqual([{ fecha: '2026-10-05', motivo: 'Festivo' }]);

    expect(await casos.borrarExcepcion('2026-10-05')).toBe(true);
    expect(await horarioEn(LUNES_10_BOGOTA).estaDentroDeHorario()).toBe(true);
  });

  it('CFG2 — Una excepción repetida se rechaza y la primera se conserva', async () => {
    const { casos } = await contexto();
    await casos.crearExcepcion('2026-12-25', 'Navidad');

    expect(await casos.crearExcepcion('2026-12-25', 'otra')).toEqual({ ok: false, razon: 'duplicada' });
    expect((await casos.obtenerHorario()).excepciones).toEqual([{ fecha: '2026-12-25', motivo: 'Navidad' }]);
  });

  it('CFG2 — Borrar una excepción que no existe devuelve falso', async () => {
    const { casos } = await contexto();

    expect(await casos.borrarExcepcion('2030-01-01')).toBe(false);
  });
});

describe('Envíos y gasto contra Postgres (CFG3, CFG4)', () => {
  it('CFG3 — Cambiar el factor volumétrico lo lee el catálogo en la siguiente cotización, sin reiniciar', async () => {
    const { casos, prisma } = await contexto();
    const catalogo = new RepositorioParametroCatalogoPrisma(prisma);
    expect(await catalogo.obtenerFactorVolumetrico()).toBe(4000);

    await casos.guardarEnvios({ recargoContraentregaPct: 6, factorVolumetrico: 5000 });

    expect(await catalogo.obtenerFactorVolumetrico()).toBe(5000);
    expect((await casos.obtenerEnvios()).recargoContraentregaPct).toBe(6);
  });

  it('CFG3 — Un factor no entero no cambia lo guardado', async () => {
    const { casos } = await contexto();
    await casos.guardarEnvios({ recargoContraentregaPct: 5, factorVolumetrico: 4000 });

    expect((await casos.guardarEnvios({ recargoContraentregaPct: 9, factorVolumetrico: 4000.5 })).ok).toBe(false);
    expect((await casos.obtenerEnvios()).recargoContraentregaPct).toBe(5);
  });

  it('CFG4 — Guardar el techo no toca el estado que escribe el gateway', async () => {
    const { casos, prisma } = await contexto();
    const estado = { mes: '2026-10', gastoUsd: 12, techoUsd: 10, avisoEmitido: true, bloqueado: true };
    await prisma.parametro.create({ data: { clave: 'llm_estado_techo', valor: estado } });

    await casos.guardarGastoLlm({ techoMensualUsd: 20 });

    expect((await prisma.parametro.findUnique({ where: { clave: 'llm_estado_techo' } }))?.valor).toEqual(estado);
    expect(await casos.obtenerGastoLlm()).toMatchObject({ techoMensualUsd: 20, gastoMesUsd: 12, estado: { bloqueado: true } });
  });
});

describe('Registro tipado de parametro contra Postgres (CFG6)', () => {
  it('CFG6 — Escribir una clave fuera del registro se rechaza y no se escribe nada', async () => {
    const { repositorio, prisma } = await contexto();

    await expect(
      repositorio.guardarParametros(
        [
          { clave: 'recargo_contraentrega_pct', valor: 8 },
          { clave: 'mensaje_handoff', valor: 'texto' },
        ],
        new ClockSistema().ahora(),
      ),
    ).rejects.toBeInstanceOf(ClaveFueraDelRegistro);

    expect(await prisma.parametro.count({ where: { clave: { in: ['recargo_contraentrega_pct', 'mensaje_handoff'] } } })).toBe(0);
  });

  it('CFG6 — Un valor del tipo equivocado para su clave se rechaza', async () => {
    const { repositorio } = await contexto();

    await expect(repositorio.guardarParametros([{ clave: 'recargo_contraentrega_pct', valor: '5' }], new ClockSistema().ahora())).rejects.toBeInstanceOf(ClaveFueraDelRegistro);
  });
});

describe('R15 — Horario, textos y parámetros son datos (Fase 12, T11, integración)', () => {
  it('R15 — El horario de atención se lee como dato: cambiar el día en la base cambia la respuesta', async () => {
    const { casos, horarioEn } = await contexto();
    await casos.guardarHorario(SEMANA);
    expect(await horarioEn(LUNES_10_BOGOTA).estaDentroDeHorario()).toBe(true);

    await casos.guardarHorario({ ...SEMANA, lun: null });

    expect(await horarioEn(LUNES_10_BOGOTA).estaDentroDeHorario()).toBe(false);
  });

  it('R15 — Los textos al cliente vienen de un caso del asistente, con su respaldo solo si el caso falta', async () => {
    const { prisma } = await contexto();
    await limpiarCasos(prisma);
    const textos = textosSinCopia(prisma);
    expect(await textos.textoDelSistema('mensaje_espera_handoff')).toBe(textoDeRespaldo('mensaje_espera_handoff'));

    await fijarTextosDelSistema(prisma, { mensaje_espera_handoff: 'Un asesor te escribe en unos minutos.' });

    expect(await textos.textoDelSistema('mensaje_espera_handoff')).toBe('Un asesor te escribe en unos minutos.');
    await limpiarCasos(prisma);
  });

  it('R15 — Un parámetro del negocio se ajusta sin desplegar código', async () => {
    const { casos, prisma } = await contexto();
    const catalogo = new RepositorioParametroCatalogoPrisma(prisma);

    await casos.guardarEnvios({ recargoContraentregaPct: 5, factorVolumetrico: 6000 });

    expect(await catalogo.obtenerFactorVolumetrico()).toBe(6000);
  });
});
