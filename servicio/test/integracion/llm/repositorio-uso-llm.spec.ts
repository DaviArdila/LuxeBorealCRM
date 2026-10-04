import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { RepositorioUsoLlmPrisma } from '../../../src/modulos/llm/infraestructura/prisma/repositorio-uso-llm-prisma.js';
import { inicioMesUTC } from '../../../src/modulos/llm/dominio/calcular-costo.js';
import type { FilaUsoLlm } from '../../../src/modulos/llm/puertos/repositorio-uso-llm.js';
import {
  CONFIGURACION,
  ConfiguracionModule,
  cargarConfiguracion,
} from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

// T7 (fase-06-pasarela-llm): el repositorio de `uso_llm` contra Postgres real (LLM6, LLM13, D7, D10).

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearRepositorio() {
  Logger.overrideLogger(false);
  const configuracion = cargarConfiguracion({
    NODE_ENV: 'test',
    DATABASE_URL: urlPostgresDePrueba(),
    REDIS_URL: urlRedisDePrueba(),
  });
  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracion)
    .compile();
  const prisma = modulo.get(PrismaService);
  await prisma.usoLlm.deleteMany();
  return { repositorio: new RepositorioUsoLlmPrisma(prisma), prisma };
}

const EXITO: FilaUsoLlm = {
  proveedor: 'openrouter',
  modelo: 'openai/gpt-5.6-luna',
  tokensEntrada: 1000,
  tokensSalida: 500,
  tokensCache: 200,
  costoEstimadoUsd: 0.0008,
  latenciaMs: 850,
  exito: true,
};

function fila(sobrescribir: Partial<FilaUsoLlm>): FilaUsoLlm {
  return { ...EXITO, ...sobrescribir };
}

describe('llm — RepositorioUsoLlmPrisma (T7, integración)', () => {
  it('LLM6 — Llamada exitosa registra proveedor, modelo, tokens, costo, latencia y resultado', async () => {
    const { repositorio, prisma } = await crearRepositorio();

    await repositorio.registrarUso(EXITO);

    const filas = await prisma.usoLlm.findMany();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      proveedor: 'openrouter',
      modelo: 'openai/gpt-5.6-luna',
      tokensEntrada: 1000,
      tokensSalida: 500,
      tokensCache: 200,
      latenciaMs: 850,
      exito: true,
      conversacionId: null,
    });
    expect(filas[0]?.costoEstimadoUsd.toString()).toBe('0.0008');
    expect(filas[0]?.creado).toBeInstanceOf(Date);
  });

  it('LLM6 — Llamada fallida también deja su fila en uso_llm', async () => {
    const { repositorio, prisma } = await crearRepositorio();

    await repositorio.registrarUso(
      fila({
        modelo: 'modelo/que-fallo',
        tokensEntrada: 0,
        tokensSalida: 0,
        tokensCache: 0,
        costoEstimadoUsd: 0,
        latenciaMs: 15_000,
        exito: false,
      }),
    );

    const filas = await prisma.usoLlm.findMany();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      modelo: 'modelo/que-fallo',
      tokensEntrada: 0,
      latenciaMs: 15_000,
      exito: false,
    });
    expect(filas[0]?.costoEstimadoUsd.toString()).toBe('0');
  });

  it('LLM13 — Fallo de escritura no tumba la respuesta y queda visible', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    // Una conversación inexistente viola la FK de `uso_llm`: fallo real de Postgres, sin mocks.
    await expect(
      repositorio.registrarUso(fila({ conversacionId: '00000000-0000-7000-8000-000000000000' })),
    ).resolves.toBeUndefined();

    expect(await prisma.usoLlm.count()).toBe(0);
    expect(error).toHaveBeenCalledTimes(1);
    const registrado = JSON.stringify(error.mock.calls[0]);
    expect(registrado).toContain('llm.uso-no-registrado');
    expect(registrado).toContain('openai/gpt-5.6-luna');
    expect(registrado).not.toContain('00000000-0000-7000-8000-000000000000');
    error.mockRestore();
  });

  it('LLM13 — Agregado mensual por proveedor y modelo para el techo', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    const desde = inicioMesUTC(new Date('2026-09-28T15:00:00.000Z'));
    const insertar = (creado: string, proveedor: string, modelo: string, costo: string) =>
      prisma.usoLlm.create({
        data: {
          proveedor,
          modelo,
          tokensEntrada: 1,
          tokensSalida: 1,
          tokensCache: 0,
          costoEstimadoUsd: costo,
          latenciaMs: 10,
          exito: true,
          creado: new Date(creado),
        },
      });
    await insertar('2026-08-31T23:59:59.999Z', 'openrouter', 'modelo/a', '9.000000');
    await insertar('2026-09-01T00:00:00.000Z', 'openrouter', 'modelo/a', '0.000123');
    await insertar('2026-09-20T10:00:00.000Z', 'openrouter', 'modelo/a', '0.000456');
    await insertar('2026-09-21T10:00:00.000Z', 'openrouter', 'modelo/b', '1.000000');
    await insertar('2026-09-22T10:00:00.000Z', 'pasarela', 'techo-alcanzado', '0.000000');

    const total = await repositorio.gastoMensual(desde);
    const porModelo = await repositorio.gastoMensualPorModelo(desde);

    expect(total).toBe(1.000579);
    expect(porModelo).toEqual([
      { proveedor: 'openrouter', modelo: 'modelo/a', costoUsd: 0.000579 },
      { proveedor: 'openrouter', modelo: 'modelo/b', costoUsd: 1 },
      { proveedor: 'pasarela', modelo: 'techo-alcanzado', costoUsd: 0 },
    ]);
    expect(porModelo.reduce((suma, grupo) => suma + grupo.costoUsd, 0)).toBeCloseTo(total, 6);
  });

  it('sin filas del mes el gasto es cero y el desglose queda vacío', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    await prisma.usoLlm.create({
      data: {
        proveedor: 'openrouter',
        modelo: 'modelo/a',
        tokensEntrada: 1,
        tokensSalida: 1,
        tokensCache: 0,
        costoEstimadoUsd: '5.000000',
        latenciaMs: 10,
        exito: true,
        creado: new Date('2026-08-15T10:00:00.000Z'),
      },
    });
    const desde = inicioMesUTC(new Date('2026-09-28T15:00:00.000Z'));

    expect(await repositorio.gastoMensual(desde)).toBe(0);
    expect(await repositorio.gastoMensualPorModelo(desde)).toEqual([]);
  });

  it('el agregado mensual usa el índice por creado que agrega la migración de la Fase 06 (D10)', async () => {
    const { prisma } = await crearRepositorio();

    const indices = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'uso_llm' AND indexdef LIKE '%(creado)%'
    `;

    expect(indices.map((indice) => indice.indexname)).toEqual(['uso_llm_creado_idx']);
  });
});
