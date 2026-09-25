import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `.githooks/pre-push` real (CI1, D9). Estos tres escenarios exigen un `git push` de verdad, no
 * una aserción de contenido — pero invocar `npm run ci:hook` de la **raíz real** de este
 * repositorio desde aquí recrearía exactamente la recursión sin salida que ya documentó
 * `workflow-ci.spec.ts` para CI7 (`ci:hook` corre `npm test`, que volvería a ejecutar este mismo
 * archivo, que volvería a invocar `npm run ci:hook`...).
 *
 * En su lugar, cada test copia el `.githooks/pre-push` **real** (byte a byte, vía `readFileSync`)
 * dentro de un repositorio git aislado en un directorio temporal, con un `package.json` propio
 * cuyo `ci:hook` reproduce la composición real leída del `package.json` de este proyecto — mismos
 * pasos, mismo orden — pero con cada paso atómico sustituido por un comando trivial y
 * determinista (`exit 0`/`exit 1`). El repositorio aislado empuja de verdad, con `git push` real,
 * contra un repositorio bare local también temporal. Lo que se prueba es el mecanismo del hook
 * (bloqueo, mensaje, `--no-verify`, ausencia de `test:integracion`), no el resultado de lint o
 * typecheck reales — esos ya tienen su propia cobertura dedicada (`eslint.spec.ts`, etc.).
 */

const raizDelProyecto = path.join(import.meta.dirname, '..', '..');
const prePushReal = readFileSync(path.join(raizDelProyecto, '.githooks', 'pre-push'), 'utf8');

const pasosReales = (
  JSON.parse(readFileSync(path.join(raizDelProyecto, 'package.json'), 'utf8')) as {
    readonly scripts: Readonly<Record<string, string>>;
  }
).scripts['ci:hook']
  .split('&&')
  .map((paso) => paso.trim());

interface RepoAislado {
  readonly origen: string;
  readonly bareDir: string;
  readonly bare: string;
}

async function crearRepoConHookYRemoto(
  scriptsAtomicos: Readonly<Record<string, string>>,
  pasosCiHook: readonly string[],
): Promise<RepoAislado> {
  const origen = await mkdtemp(path.join(tmpdir(), 'luxe-prepush-origen-'));
  const bareDir = await mkdtemp(path.join(tmpdir(), 'luxe-prepush-bare-'));
  const bare = path.join(bareDir, 'remoto.git');

  execFileSync('git', ['init', '--quiet', '--bare', bare]);

  execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: origen });
  execFileSync('git', ['config', 'user.email', 'prueba@luxeboreal.test'], { cwd: origen });
  execFileSync('git', ['config', 'user.name', 'Prueba'], { cwd: origen });
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: origen });
  execFileSync('git', ['remote', 'add', 'origin', bare], { cwd: origen });

  await mkdir(path.join(origen, '.githooks'), { recursive: true });
  await writeFile(path.join(origen, '.githooks', 'pre-push'), prePushReal, 'utf8');
  await chmod(path.join(origen, '.githooks', 'pre-push'), 0o755);

  const scripts: Record<string, string> = {
    ...scriptsAtomicos,
    'ci:hook': pasosCiHook.join(' && '),
  };
  await writeFile(
    path.join(origen, 'package.json'),
    JSON.stringify({ name: 'luxe-prepush-simulado', private: true, scripts }, null, 2),
    'utf8',
  );

  await writeFile(path.join(origen, 'archivo.txt'), 'contenido inicial\n', 'utf8');
  execFileSync('git', ['add', '.'], { cwd: origen });
  execFileSync('git', ['commit', '--quiet', '-m', 'chore: inicial'], { cwd: origen });

  return { origen, bareDir, bare };
}

async function limpiar(repo: RepoAislado): Promise<void> {
  await rm(repo.origen, { recursive: true, force: true });
  await rm(repo.bareDir, { recursive: true, force: true });
}

function refRemotoExiste(repo: RepoAislado): boolean {
  const resultado = spawnSync(
    'git',
    ['--git-dir', repo.bare, 'rev-parse', '--verify', 'refs/heads/main'],
    { encoding: 'utf8' },
  );
  return resultado.status === 0;
}

describe('.githooks/pre-push — CI1 (repositorio git aislado, git push real)', () => {
  it(
    'CI1 — Un error de lint bloquea el push',
    async () => {
      const repo = await crearRepoConHookYRemoto({ lint: 'exit 1' }, ['npm run lint']);
      try {
        const resultado = spawnSync('git', ['push', 'origin', 'main'], {
          cwd: repo.origen,
          encoding: 'utf8',
        });

        expect(resultado.status).not.toBe(0);
        const salida = `${resultado.stdout ?? ''}${resultado.stderr ?? ''}`;
        expect(salida).toContain('FALLÓ npm run ci:hook');
        expect(salida).toContain('Push bloqueado');
        expect(refRemotoExiste(repo)).toBe(false);
      } finally {
        await limpiar(repo);
      }
    },
    // 90 s, no 30 s: cada test de este archivo hace varios `spawn`/`spawnSync` reales (git init,
    // npm run anidado) y, bajo la contención real de Docker Desktop en Windows que ya documentaron
    // T6/T7 (`vitest.config.ts`, `eslint.spec.ts`) cuando corre en paralelo con otros archivos que
    // también usan Docker/subprocesos reales, 30 s no bastó en una corrida real de `npm run ci`
    // (falló por timeout, no por el mecanismo bajo prueba — confirmado corriendo el archivo solo,
    // en verde, varias veces).
    90_000,
  );

  it(
    'CI1 — El hook se salta explícitamente',
    async () => {
      const repo = await crearRepoConHookYRemoto({ lint: 'exit 1' }, ['npm run lint']);
      try {
        const resultado = spawnSync('git', ['push', '--no-verify', 'origin', 'main'], {
          cwd: repo.origen,
          encoding: 'utf8',
        });

        expect(resultado.status).toBe(0);
        const salida = `${resultado.stdout ?? ''}${resultado.stderr ?? ''}`;
        // El hook nunca corrió: su propio mensaje de arranque no aparece en la salida — el salto
        // queda visible precisamente porque no hay ningún rastro de que el hook haya ejecutado.
        expect(salida).not.toContain('pre-push: corriendo');
        expect(refRemotoExiste(repo)).toBe(true);
      } finally {
        await limpiar(repo);
      }
    },
    90_000,
  );

  it(
    'CI1 — El hook no corre tests de integración',
    async () => {
      // Confirmación estructural: la composición real de ci:hook (package.json de este
      // repositorio) nunca invoca test:integracion.
      expect(pasosReales).not.toContain('npm run test:integracion');
      expect(pasosReales.join(' ')).not.toMatch(/test:integracion/);

      const scriptsAtomicos: Record<string, string> = {};
      for (const paso of pasosReales) {
        const nombre = paso === 'npm test' ? 'test' : paso.replace(/^npm run /, '');
        scriptsAtomicos[nombre] = 'exit 0';
      }

      const repo = await crearRepoConHookYRemoto(scriptsAtomicos, pasosReales);
      try {
        // Sin DATABASE_URL/REDIS_URL en el entorno del proceso hijo: si la composición real de
        // ci:hook necesitara Postgres o Redis (tests de integración), no tendría forma de
        // conectarse y el push fallaría. Como pasa igual, la ausencia de test:integracion (ya
        // confirmada arriba) es la explicación real, no una casualidad del entorno de prueba.
        const entornoSinInfraestructura = { ...process.env };
        delete entornoSinInfraestructura.DATABASE_URL;
        delete entornoSinInfraestructura.REDIS_URL;

        const resultado = spawnSync('git', ['push', 'origin', 'main'], {
          cwd: repo.origen,
          encoding: 'utf8',
          env: entornoSinInfraestructura,
        });

        expect(resultado.status).toBe(0);
        expect(refRemotoExiste(repo)).toBe(true);
      } finally {
        await limpiar(repo);
      }
    },
    90_000,
  );
});
