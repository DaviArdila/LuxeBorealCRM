import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validarFlujos } from '../../scripts/validar-flujos.js';

/**
 * `scripts/validar-flujos.ts` (CI6, D10). Se ejercita contra un repositorio git aislado y real en
 * un directorio temporal — `actionlint` descubre `.github/workflows/` buscando la raíz del
 * repositorio git hacia arriba desde el directorio montado; sin `.git/` falla con "no project was
 * found" en vez de analizar el YAML (RED real de esta tarea). Requiere Docker corriendo
 * (ADR-0009).
 */
async function crearDirectorioConWorkflow(contenido: string): Promise<string> {
  const raiz = await mkdtemp(path.join(tmpdir(), 'luxe-flujos-prueba-'));
  execFileSync('git', ['init', '--quiet'], { cwd: raiz });
  execFileSync('git', ['config', 'user.email', 'prueba@luxeboreal.test'], { cwd: raiz });
  execFileSync('git', ['config', 'user.name', 'Prueba'], { cwd: raiz });
  const directorio = path.join(raiz, '.github', 'workflows');
  await mkdir(directorio, { recursive: true });
  await writeFile(path.join(directorio, 'ci.yml'), contenido, 'utf8');
  return raiz;
}

describe('scripts/validar-flujos — validarFlujos', () => {
  it(
    'CI6 — Un YAML de workflow mal formado falla la validación estática, nombrando el archivo y el error',
    async () => {
      const raiz = await crearDirectorioConWorkflow(
        [
          'name: CI',
          'on: [push]',
          'jobs:',
          '  ci:',
          '    runs-on: ubuntu-latest',
          '    steps:',
          '      - uses: accion/que-no-existe-jamas@v1', // acción inexistente
          '      - run: npm run ci',
          '          indentacion-invalida: true', // YAML mal formado
        ].join('\n'),
      );
      try {
        const resultado = await validarFlujos(raiz);

        expect(resultado.limpio).toBe(false);
        expect(resultado.mensaje).toContain('ci.yml');
      } finally {
        await rm(raiz, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it(
    'un workflow bien formado, con acciones y pasos válidos, pasa sin errores',
    async () => {
      const raiz = await crearDirectorioConWorkflow(
        [
          'name: CI',
          'on:',
          '  push:',
          '  pull_request:',
          'permissions:',
          '  contents: read',
          'jobs:',
          '  ci:',
          '    runs-on: ubuntu-latest',
          '    steps:',
          '      - run: npm run ci',
          '',
        ].join('\n'),
      );
      try {
        const resultado = await validarFlujos(raiz);

        expect(resultado.limpio).toBe(true);
      } finally {
        await rm(raiz, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
