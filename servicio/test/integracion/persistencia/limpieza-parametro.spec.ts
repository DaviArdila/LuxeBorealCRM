import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Client } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { SembrarCasos } from '../../../src/modulos/asistente/aplicacion/sembrar-casos.js';
import { RepositorioSemillaPrisma } from '../../../src/modulos/asistente/infraestructura/prisma/repositorio-semilla-prisma.js';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { ClockSistema } from '../../../src/plataforma/reloj/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { limpiarCasos } from '../../soporte/textos-asistente.js';

// Fase 12, T11: `parametro` queda solo con configuración del negocio (CFG6, EST-D4).

const MIGRACION = path.resolve(import.meta.dirname, '..', '..', '..', 'prisma', 'migrations', '20261006140000_limpiar_estilo_de_parametro', 'migration.sql');
const PREFIJOS_DE_TEXTO = ['mensaje_', 'aviso_', 'politica_', 'prompt_estilo'];

let modulo: TestingModule | undefined;

afterEach(async () => {
  if (modulo !== undefined) {
    const prisma = modulo.get(PrismaService);
    await prisma.parametro.deleteMany({ where: { OR: PREFIJOS_DE_TEXTO.map((prefijo) => ({ clave: { startsWith: prefijo } })) } });
    await limpiarCasos(prisma);
  }
  await modulo?.close();
  modulo = undefined;
});

describe('Limpieza de parametro (Fase 12, T11, integración)', () => {
  it('EST-D4 — Las claves viejas del estilo desaparecen de parametro y el resto se conserva', async () => {
    const cliente = new Client({ connectionString: urlPostgresDePrueba() });
    await cliente.connect();
    try {
      await cliente.query('BEGIN');
      try {
        for (const clave of ['prompt_estilo', 'prompt_estilo_version', 'prompt_estilo_historial', 'factor_volumetrico']) {
          await cliente.query(
            `INSERT INTO parametro (clave, valor, actualizado) VALUES ($1, '1'::jsonb, '2026-10-04T09:00:00Z') ON CONFLICT (clave) DO NOTHING`,
            [clave],
          );
        }
        await cliente.query(readFileSync(MIGRACION, 'utf8'));
        const quedan = await cliente.query<{ clave: string }>(`SELECT clave FROM parametro WHERE clave LIKE 'prompt_estilo%'`);
        const factor = await cliente.query(`SELECT 1 FROM parametro WHERE clave = 'factor_volumetrico'`);

        expect(quedan.rows).toEqual([]);
        expect(factor.rowCount).toBe(1);
      } finally {
        await cliente.query('ROLLBACK');
      }
    } finally {
      await cliente.end();
    }
  });

  it('CFG6 — Después de la limpieza no quedan textos ni estilo en parametro', async () => {
    Logger.overrideLogger(false);
    modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule] })
      .overrideProvider(CONFIGURACION)
      .useValue(cargarConfiguracion({ NODE_ENV: 'test', DATABASE_URL: urlPostgresDePrueba(), REDIS_URL: urlRedisDePrueba() }))
      .compile();
    const prisma = modulo.get(PrismaService);
    await limpiarCasos(prisma);
    await prisma.parametro.createMany({
      data: [
        { clave: 'mensaje_handoff', valor: 'Texto viejo del traspaso.' },
        { clave: 'politica_garantia', valor: 'Un año de garantía.' },
        { clave: 'aviso_datos', valor: 'Soy un asistente automatizado.' },
      ],
      skipDuplicates: true,
    });
    const version = { obtener: () => Promise.resolve('0'), incrementar: () => Promise.resolve() };

    await new SembrarCasos(new RepositorioSemillaPrisma(prisma), version, new ClockSistema()).ejecutar();

    // Solo las filas que este test sembró: otros archivos de integración comparten la base y pueden escribir las suyas.
    const quedan = await prisma.parametro.findMany({ where: { clave: { in: ['mensaje_handoff', 'politica_garantia', 'aviso_datos'] } } });
    expect(quedan).toEqual([]);
    expect(await prisma.casoAsistente.count({ where: { titulo: 'Garantía' } })).toBe(1);
  });
});
