import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';
import { fijarTextosDelSistema, limpiarCasos, textosSinCopia } from '../../soporte/textos-asistente.js';

// T5 (fase-07a) / T5 (fase-12): textos fijos del agente desde los casos del asistente con respaldo único (AGT3, R15, CAS7).

let modulo: TestingModule | undefined;

afterEach(async () => {
  if (modulo !== undefined) await limpiarCasos(modulo.get(PrismaService));
  await modulo?.close();
  modulo = undefined;
});

async function crearTextos() {
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
  await limpiarCasos(prisma);
  return { textos: textosSinCopia(prisma), prisma };
}

describe('Textos fijos del agente desde el asistente (T5, integración)', () => {
  it('AGT3 — Un texto configurado por el negocio reemplaza al de respaldo', async () => {
    const { textos, prisma } = await crearTextos();
    await fijarTextosDelSistema(prisma, { mensaje_pedir_texto_audio: 'Escríbeme, por favor' });

    expect(await textos.textoDelSistema('mensaje_pedir_texto_audio')).toBe('Escríbeme, por favor');
  });

  it('AGT3 — Sin el parámetro se usa el texto de respaldo', async () => {
    const { textos } = await crearTextos();

    const texto = await textos.textoDelSistema('mensaje_imagen_no_procesada');

    expect(texto).toContain('SKU');
  });

  it('un valor en blanco cae al respaldo sin lanzar', async () => {
    const { textos, prisma } = await crearTextos();
    await fijarTextosDelSistema(prisma, { mensaje_pedir_texto_audio: '   ', aviso_datos: '\n' });

    expect(await textos.textoDelSistema('mensaje_pedir_texto_audio')).toContain('texto');
    expect(await textos.textoDelSistema('aviso_datos')).toContain('asistente automatizado');
  });

  it('todas las claves tienen un respaldo no vacío', async () => {
    const { textos } = await crearTextos();

    for (const clave of [
      'mensaje_pedir_texto_audio',
      'mensaje_imagen_no_procesada',
      'aviso_datos',
      'mensaje_handoff',
      'mensaje_handoff_fuera_horario',
    ] as const) {
      expect((await textos.textoDelSistema(clave)).trim().length).toBeGreaterThan(0);
    }
  });
});
