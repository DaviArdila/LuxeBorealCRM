import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { RepositorioParametroAgentePrisma } from '../../../src/modulos/agente/infraestructura/prisma/repositorio-parametro-agente-prisma.js';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

// T5 (fase-07a): textos fijos del agente desde `parametro` con respaldo único (AGT3, R15, D9).

let modulo: TestingModule | undefined;

const CLAVES_DE_PRUEBA = ['mensaje_pedir_texto_audio', 'mensaje_imagen_no_procesada', 'aviso_datos'];

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
  await prisma.parametro.deleteMany({ where: { clave: { in: CLAVES_DE_PRUEBA } } });
  return { repositorio: new RepositorioParametroAgentePrisma(prisma), prisma };
}

describe('RepositorioParametroAgentePrisma (T5, integración)', () => {
  it('AGT3 — Un texto configurado por el negocio reemplaza al de respaldo', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    await prisma.parametro.create({
      data: { clave: 'mensaje_pedir_texto_audio', valor: 'Escríbeme, por favor' },
    });

    expect(await repositorio.obtenerTexto('mensaje_pedir_texto_audio')).toBe('Escríbeme, por favor');

    await prisma.parametro.deleteMany({ where: { clave: { in: CLAVES_DE_PRUEBA } } });
  });

  it('AGT3 — Sin el parámetro se usa el texto de respaldo', async () => {
    const { repositorio } = await crearRepositorio();

    const texto = await repositorio.obtenerTexto('mensaje_imagen_no_procesada');

    expect(texto).toContain('SKU');
  });

  it('un valor en blanco o que no es texto cae al respaldo sin lanzar', async () => {
    const { repositorio, prisma } = await crearRepositorio();
    await prisma.parametro.create({ data: { clave: 'mensaje_pedir_texto_audio', valor: '   ' } });
    await prisma.parametro.create({ data: { clave: 'aviso_datos', valor: 42 } });

    expect(await repositorio.obtenerTexto('mensaje_pedir_texto_audio')).toContain('texto');
    expect(await repositorio.obtenerTexto('aviso_datos')).toContain('asistente automatizado');

    await prisma.parametro.deleteMany({ where: { clave: { in: CLAVES_DE_PRUEBA } } });
  });

  it('todas las claves tienen un respaldo no vacío', async () => {
    const { repositorio } = await crearRepositorio();

    for (const clave of [
      'mensaje_pedir_texto_audio',
      'mensaje_imagen_no_procesada',
      'aviso_datos',
      'mensaje_handoff',
      'mensaje_handoff_fuera_horario',
    ] as const) {
      expect((await repositorio.obtenerTexto(clave)).trim().length).toBeGreaterThan(0);
    }
  });
});
