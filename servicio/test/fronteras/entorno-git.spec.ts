import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { entornoSinUbicacionGit } from '../../scripts/herramientas.js';
import { resolverRangoDeCommits } from '../../scripts/verificar-commits.js';
import { quitarUbicacionGitDelProceso } from '../soporte/git-aislado.js';

/**
 * Git exporta `GIT_DIR` (y otras variables de ubicación) a sus hooks. Cuando `pre-push` corrió
 * `npm run ci:hook` con ellas puestas, los tests que crean repositorios de prueba escribieron en el
 * repositorio real: movieron la rama empujada, `refs/remotes/origin/main` y `core.bare`. Estos
 * tests simulan ese entorno con un repositorio centinela y comprueban que nada lo toca.
 */
const env = { ...process.env };
function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: entornoSinUbicacionGit(env),
  }).trim();
}

async function crearRepositorio(prefijo: string): Promise<string> {
  const raiz = await mkdtemp(path.join(tmpdir(), prefijo));
  git(['init', '--quiet', '--initial-branch=main'], raiz);
  git(['config', 'user.email', 'centinela@luxeboreal.test'], raiz);
  git(['config', 'user.name', 'Centinela'], raiz);
  git(['commit', '--allow-empty', '--quiet', '-m', 'chore: centinela'], raiz);
  return raiz;
}

function huella(raiz: string): string {
  return [
    git(['rev-parse', 'HEAD'], raiz),
    git(['for-each-ref', '--format=%(refname) %(objectname)'], raiz),
    git(['config', '--local', '--list'], raiz),
  ].join('\n');
}

describe('aislamiento de las variables de ubicación de git que exporta un hook', () => {
  let centinela: string;
  let otro: string;
  const previos = new Map<string, string | undefined>();

  beforeEach(async () => {
    centinela = await crearRepositorio('luxe-centinela-');
    otro = await crearRepositorio('luxe-otro-');
    for (const nombre of ['GIT_DIR', 'GIT_WORK_TREE', 'LUXE_COMMITS_DESDE']) {
      previos.set(nombre, process.env[nombre]);
    }
    delete process.env.LUXE_COMMITS_DESDE;
    process.env.GIT_DIR = path.join(centinela, '.git');
    process.env.GIT_WORK_TREE = centinela;
  });

  afterEach(async () => {
    for (const [nombre, valor] of previos) {
      if (valor === undefined) delete process.env[nombre];
      else process.env[nombre] = valor;
    }
    await rm(centinela, { recursive: true, force: true });
    await rm(otro, { recursive: true, force: true });
  });

  it('un repositorio de prueba creado tras quitarUbicacionGitDelProceso no toca el centinela', async () => {
    const antes = huella(centinela);
    const restaurar = quitarUbicacionGitDelProceso();
    const prueba = await mkdtemp(path.join(tmpdir(), 'luxe-prueba-'));
    try {
      execFileSync('git', ['init', '--quiet', '--initial-branch=trabajo'], {
        cwd: prueba,
      });
      execFileSync('git', ['config', 'user.name', 'Prueba'], { cwd: prueba });
      execFileSync('git', ['config', 'user.email', 'prueba@luxeboreal.test'], {
        cwd: prueba,
      });
      execFileSync(
        'git',
        ['commit', '--allow-empty', '--quiet', '-m', 'chore: falso'],
        {
          cwd: prueba,
        },
      );
      execFileSync('git', ['config', 'core.bare', 'true'], { cwd: prueba });
    } finally {
      restaurar();
      await rm(prueba, { recursive: true, force: true });
    }

    expect(huella(centinela)).toBe(antes);
    expect(process.env.GIT_DIR).toBe(path.join(centinela, '.git'));
  });

  it('verificar-commits inspecciona la raíz que recibe aunque el entorno traiga GIT_DIR', () => {
    git(
      ['commit', '--allow-empty', '--quiet', '-m', 'feat: solo en el otro'],
      otro,
    );
    git(['update-ref', 'refs/remotes/origin/main', 'HEAD~1'], otro);
    git(['branch', '--quiet', '-m', 'trabajo'], otro);
    const esperado = git(['rev-parse', 'HEAD'], otro);

    expect(resolverRangoDeCommits(otro)).toEqual([esperado]);
  });
});
