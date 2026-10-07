import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promptEstilo } from '../../../scripts/prompt-estilo.js';
import { PrismaService } from '../../../src/plataforma/prisma/index.js';
import { Test } from '@nestjs/testing';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { PrismaModule } from '../../../src/plataforma/prisma/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

// Fase 08c, T5: `npm run prompt:estilo` de punta a punta con el contexto real de Nest, Postgres y Redis (AGT22).

const CLAVES_ENTORNO = ['NODE_ENV', 'DATABASE_URL', 'REDIS_URL'] as const;

let carpeta: string;
let restaurar: (() => void) | undefined;

async function autoresGuardados(): Promise<(string | null)[]> {
  const modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(cargarConfiguracion({ NODE_ENV: 'test', DATABASE_URL: urlPostgresDePrueba(), REDIS_URL: urlRedisDePrueba() }))
    .compile();
  const filas = await modulo.get(PrismaService).versionEstilo.findMany({ orderBy: { version: 'asc' } });
  await modulo.close();
  return filas.map((fila) => fila.publicadoPorId);
}

async function limpiarBase(): Promise<void> {
  const modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(cargarConfiguracion({ NODE_ENV: 'test', DATABASE_URL: urlPostgresDePrueba(), REDIS_URL: urlRedisDePrueba() }))
    .compile();
  await modulo.get(PrismaService).versionEstilo.deleteMany();
  await modulo.get(PrismaService).seccionEstilo.deleteMany();
  await modulo.close();
}

beforeEach(async () => {
  carpeta = await mkdtemp(path.join(tmpdir(), 'estilo-'));
  const originales = Object.fromEntries(CLAVES_ENTORNO.map((clave) => [clave, process.env[clave]]));
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = urlPostgresDePrueba();
  process.env.REDIS_URL = urlRedisDePrueba();
  restaurar = () => {
    for (const clave of CLAVES_ENTORNO) {
      if (originales[clave] === undefined) delete process.env[clave];
      else process.env[clave] = originales[clave];
    }
  };
  await limpiarBase();
});

afterEach(async () => {
  restaurar?.();
  vi.restoreAllMocks();
  await rm(carpeta, { recursive: true, force: true });
});

async function archivo(nombre: string, contenido: string): Promise<string> {
  const ruta = path.join(carpeta, nombre);
  await writeFile(ruta, contenido, 'utf8');
  return ruta;
}

describe('Comando prompt:estilo de punta a punta (Fase 08c, T5, AGT22)', () => {
  it('AGT22 — Publicar desde un archivo deja el estilo vigente', async () => {
    const ruta = await archivo('estilo.md', '# Cómo escribes\n\n- Sin emojis.\n- Respuestas cortas.\n');

    const publicado = await promptEstilo(['publicar', '--archivo', ruta]);
    const visto = await promptEstilo(['ver']);

    expect(publicado.limpio).toBe(true);
    expect(publicado.mensaje).toContain('versión 1');
    expect(visto.limpio).toBe(true);
    expect(visto.mensaje).toContain('base');
    expect(visto.mensaje).toContain('versión 1');
    expect(visto.mensaje).toContain('Respuestas cortas.');
  });

  it('sin nada publicado, ver muestra el archivo de respaldo', async () => {
    const visto = await promptEstilo(['ver']);

    expect(visto.limpio).toBe(true);
    expect(visto.mensaje).toContain('archivo');
    expect(visto.mensaje).toContain('versión 0');
  });

  it('AGT22 — Un estilo inválido no se publica: el vigente no cambia', async () => {
    const bueno = await archivo('bueno.md', 'Estilo bueno y corto.');
    const malo = await archivo('malo.md', 'Cuesta $389.000 siempre.');
    await promptEstilo(['publicar', '--archivo', bueno]);

    const resultado = await promptEstilo(['publicar', '--archivo', malo]);
    const visto = await promptEstilo(['ver']);

    expect(resultado.limpio).toBe(false);
    expect(resultado.mensaje).toMatch(/pesos/i);
    expect(visto.mensaje).toContain('Estilo bueno y corto.');
    expect(visto.mensaje).toContain('versión 1');
  });

  it('restaurar vuelve a una versión anterior como versión nueva', async () => {
    await promptEstilo(['publicar', '--archivo', await archivo('a.md', 'Primer estilo')]);
    await promptEstilo(['publicar', '--archivo', await archivo('b.md', 'Segundo estilo')]);

    const resultado = await promptEstilo(['restaurar', '--version', '1']);
    const visto = await promptEstilo(['ver']);
    const historial = await promptEstilo(['historial']);

    expect(resultado.limpio).toBe(true);
    expect(visto.mensaje).toContain('Primer estilo');
    expect(visto.mensaje).toContain('versión 3');
    expect(historial.mensaje).toContain('1');
    expect(historial.mensaje).toContain('2');
  });

  it('AGT22 — El comando no escribe el texto del estilo en los logs', async () => {
    const espiados = [vi.spyOn(Logger.prototype, 'log'), vi.spyOn(Logger.prototype, 'warn'), vi.spyOn(Logger.prototype, 'error')];
    const escrituras = vi.spyOn(process.stderr, 'write');
    const ruta = await archivo('secreto.md', 'TEXTO-CONFIDENCIAL-DEL-ESTILO sin pesos');

    const publicado = await promptEstilo(['publicar', '--archivo', ruta]);
    await promptEstilo(['historial']);
    await promptEstilo(['restaurar', '--version', '7']);

    expect(publicado.mensaje).not.toContain('TEXTO-CONFIDENCIAL');
    for (const espia of espiados) {
      expect(JSON.stringify(espia.mock.calls)).not.toContain('TEXTO-CONFIDENCIAL');
    }
    expect(JSON.stringify(escrituras.mock.calls)).not.toContain('TEXTO-CONFIDENCIAL');
  });
  it('EST-D3 — Publicar por el comando no tiene usuario', async () => {
    await promptEstilo(['publicar', '--archivo', await archivo('a.md', 'Primer estilo')]);

    expect(await autoresGuardados()).toEqual([null]);
  });

  it('EST-D2 — El comando muestra y publica igual contra la tabla nueva', async () => {
    const publicado = await promptEstilo(['publicar', '--archivo', await archivo('a.md', 'Estilo por comando')]);
    const historial = await promptEstilo(['historial']);

    expect(publicado.mensaje).toContain('versión 1');
    expect(historial.mensaje).toContain('versión 1');
    expect(historial.mensaje).toContain('(historial vacío)');
  });

  it('EST-D2 — Publicar parte el archivo en secciones y secciones las lista sin copiar sus textos', async () => {
    await promptEstilo(['publicar', '--archivo', await archivo('a.md', '# Saludo\n\nTEXTO-DE-SALUDO\n\n# Cierre\n\nTEXTO-DE-CIERRE\n')]);

    const listado = await promptEstilo(['secciones']);

    expect(listado.limpio).toBe(true);
    expect(listado.mensaje).toContain('0 · activa · Saludo');
    expect(listado.mensaje).toContain('1 · activa · Cierre');
    expect(listado.mensaje).not.toContain('TEXTO-DE');
  });

  it('EST-D2 — Restaurar una versión anterior reemplaza las secciones y ver muestra el texto compuesto', async () => {
    await promptEstilo(['publicar', '--archivo', await archivo('a.md', '# Uno\n\nPrimer texto\n')]);
    await promptEstilo(['publicar', '--archivo', await archivo('b.md', '# Dos\n\nSegundo texto\n\n# Tres\n\nTercer texto\n')]);

    await promptEstilo(['restaurar', '--version', '1']);
    const listado = await promptEstilo(['secciones']);
    const visto = await promptEstilo(['ver']);

    expect(listado.mensaje).toContain('0 · activa · Uno');
    expect(listado.mensaje).not.toContain('Dos');
    expect(visto.mensaje).toContain('Primer texto');
  });
});
