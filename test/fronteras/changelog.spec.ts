import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `changelog` (CI8, D16 de `openspec/changes/fase-00b-ci-contrato-api/design.md`). `git-cliff` se
 * invoca directamente (como Spectral, D10: paquete npm, sin script propio) contra un repositorio
 * git aislado en un directorio temporal — nunca contra el historial real de este proyecto, para no
 * acoplar el test al número exacto de commits de la fase. Usa la configuración real de
 * `cliff.toml` (mismo criterio que `verificar-commits.spec.ts` valida contra `commitlint.config.js`
 * real): lo que se prueba es que la configuración versionada agrupa por tipo, no una copia
 * reimplementada de las reglas.
 */
const rutaCliRepo = fileURLToPath(
  new URL('../../node_modules/git-cliff/lib/cli/cli.js', import.meta.url),
);
const rutaConfigReal = fileURLToPath(new URL('../../cliff.toml', import.meta.url));

function ejecutarGitCliff(repositorio: string, salida: string): void {
  execFileSync(
    'node',
    [rutaCliRepo, '--config', rutaConfigReal, '--repository', repositorio, '--output', salida],
    { encoding: 'utf8' },
  );
}

async function crearRepositorioDePrueba(): Promise<string> {
  const raiz = await mkdtemp(path.join(tmpdir(), 'luxe-changelog-prueba-'));
  execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: raiz });
  execFileSync('git', ['config', 'user.email', 'prueba@luxeboreal.test'], { cwd: raiz });
  execFileSync('git', ['config', 'user.name', 'Prueba'], { cwd: raiz });
  return raiz;
}

function commitear(raiz: string, mensaje: string): void {
  execFileSync('git', ['commit', '--allow-empty', '--quiet', '-m', mensaje], { cwd: raiz });
}

describe('changelog (git-cliff) — CI8', () => {
  it(
    'CI8 — El changelog se regenera desde los commits, agrupado por tipo de Conventional Commits',
    async () => {
      const raiz = await crearRepositorioDePrueba();
      try {
        commitear(raiz, 'feat(catalogo): agregar listado de productos');
        commitear(raiz, 'fix(salud): corregir el indicador de Redis');
        commitear(raiz, 'docs(readme): explicar el arranque local');

        const salida = path.join(raiz, 'CHANGELOG.md');
        ejecutarGitCliff(raiz, salida);
        const contenido = (await readFile(salida, 'utf8')).toLowerCase();

        expect(contenido).toContain('características');
        expect(contenido).toContain('agregar listado de productos');
        expect(contenido).toContain('correcciones');
        expect(contenido).toContain('corregir el indicador de redis');
        expect(contenido).toContain('documentación');
        expect(contenido).toContain('explicar el arranque local');
      } finally {
        await rm(raiz, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it(
    'CI8 — Una edición manual del changelog se detecta: regenerar sobrescribe la edición',
    async () => {
      const raiz = await crearRepositorioDePrueba();
      try {
        commitear(raiz, 'feat(catalogo): agregar listado de productos');
        const salida = path.join(raiz, 'CHANGELOG.md');
        ejecutarGitCliff(raiz, salida);
        const original = await readFile(salida, 'utf8');

        await writeFile(salida, 'esto no vino de ningún commit — edición manual\n', 'utf8');
        const editadoAMano = await readFile(salida, 'utf8');
        expect(editadoAMano).not.toBe(original);

        ejecutarGitCliff(raiz, salida);
        const regenerado = await readFile(salida, 'utf8');

        expect(regenerado).toBe(original);
        expect(regenerado).not.toContain('edición manual');
      } finally {
        await rm(raiz, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
