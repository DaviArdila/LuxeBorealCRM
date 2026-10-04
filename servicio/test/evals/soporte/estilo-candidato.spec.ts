import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { INestApplicationContext } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { aplicarEstiloCandidato, leerEstiloCandidato } from './estilo-candidato.js';

// Fase 08c, T6: probar un estilo candidato en las evals antes de publicarlo (EVL3, ADR-0020).

let carpeta: string;

beforeEach(async () => {
  carpeta = await mkdtemp(path.join(tmpdir(), 'candidato-'));
});
afterEach(async () => {
  await rm(carpeta, { recursive: true, force: true });
});

function aplicacion(resultado: { publicado: true; version: number } | { publicado: false; motivo: string }) {
  const recibidos: string[] = [];
  const app = {
    get: () => ({
      ejecutar: (texto: string) => {
        recibidos.push(texto);
        return Promise.resolve(resultado);
      },
    }),
  } as unknown as INestApplicationContext;
  return { app, recibidos };
}

describe('test/evals — estilo candidato', () => {
  it('leerEstiloCandidato devuelve la ruta de EVALS_ESTILO o undefined si falta o está en blanco', () => {
    expect(leerEstiloCandidato({ EVALS_ESTILO: './mi-estilo.md' })).toBe('./mi-estilo.md');
    expect(leerEstiloCandidato({ EVALS_ESTILO: '  ' })).toBeUndefined();
    expect(leerEstiloCandidato({})).toBeUndefined();
  });

  it('sin ruta no publica nada', async () => {
    const { app, recibidos } = aplicacion({ publicado: true, version: 1 });

    await expect(aplicarEstiloCandidato(app, undefined)).resolves.toBeNull();
    expect(recibidos).toEqual([]);
  });

  it('con una ruta lee el archivo y lo publica en la base de la corrida', async () => {
    const ruta = path.join(carpeta, 'candidato.md');
    await writeFile(ruta, 'Estilo candidato corto.', 'utf8');
    const { app, recibidos } = aplicacion({ publicado: true, version: 1 });

    await expect(aplicarEstiloCandidato(app, ruta)).resolves.toEqual({ version: 1 });
    expect(recibidos).toEqual(['Estilo candidato corto.']);
  });

  it('un estilo candidato inválido detiene la corrida con el motivo, sin copiar el texto', async () => {
    const ruta = path.join(carpeta, 'malo.md');
    await writeFile(ruta, 'TEXTO-PRIVADO $389.000', 'utf8');
    const { app } = aplicacion({ publicado: false, motivo: 'el estilo contiene un valor en pesos (R1, R2)' });

    const error = await aplicarEstiloCandidato(app, ruta).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('pesos');
    expect((error as Error).message).not.toContain('TEXTO-PRIVADO');
  });

  it('un archivo que no existe detiene la corrida nombrando la ruta', async () => {
    const { app } = aplicacion({ publicado: true, version: 1 });

    await expect(aplicarEstiloCandidato(app, path.join(carpeta, 'no-existe.md'))).rejects.toThrow('no-existe.md');
  });
});
