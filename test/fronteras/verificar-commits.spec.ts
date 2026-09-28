import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolverRangoDeCommits, verificarCommits } from '../../scripts/verificar-commits.js';

const raizDelProyecto = path.join(import.meta.dirname, '..', '..');

/**
 * `scripts/verificar-commits.ts` (CI2, D8, D13). Matriz de amenazas de `tasks.md`: "Estado del
 * índice" (un rango vacío MUST terminar en verde sin analizar nada) y "Estado del push"
 * (`LUXE_COMMITS_DESDE` fija el rango explícitamente al rebasar). Se ejercita contra repositorios
 * git aislados y reales en directorios temporales.
 */
async function crearRepositorioDePrueba(): Promise<string> {
  const raiz = await mkdtemp(path.join(tmpdir(), 'luxe-commits-prueba-'));
  execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: raiz });
  execFileSync('git', ['config', 'user.email', 'prueba@luxeboreal.test'], { cwd: raiz });
  execFileSync('git', ['config', 'user.name', 'Prueba'], { cwd: raiz });
  return raiz;
}

function commitear(raiz: string, mensaje: string): string {
  execFileSync('git', ['commit', '--allow-empty', '--quiet', '-m', mensaje], { cwd: raiz });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: raiz, encoding: 'utf8' }).trim();
}

describe('scripts/verificar-commits — resolverRangoDeCommits', () => {
  it('un rango vacío (main == HEAD) devuelve una lista vacía', () => {
    const raiz_ = crearRepositorioDePrueba();
    // Aísla del entorno real: si quien corre los tests ya exportó LUXE_COMMITS_DESDE (p. ej. al
    // rebasar esta rama sobre la deuda histórica de 00a, D8), ese valor no existe en el
    // repositorio de prueba aislado y `git rev-list` fallaría por una razón ajena a este escenario.
    const previo = process.env.LUXE_COMMITS_DESDE;
    delete process.env.LUXE_COMMITS_DESDE;
    return raiz_.then(async (raiz) => {
      try {
        commitear(raiz, 'chore: inicial');

        const rango = resolverRangoDeCommits(raiz);

        expect(rango).toEqual([]);
      } finally {
        if (previo !== undefined) {
          process.env.LUXE_COMMITS_DESDE = previo;
        }
        await rm(raiz, { recursive: true, force: true });
      }
    });
  });

  it('CI9 — main solo existe como refs/remotes/origin/main (checkout de rama en CI) y el rango se calcula igual', async () => {
    const raiz = await mkdtemp(path.join(tmpdir(), 'luxe-commits-prueba-'));
    execFileSync('git', ['init', '--quiet', '--initial-branch=trabajo'], { cwd: raiz });
    execFileSync('git', ['config', 'user.email', 'prueba@luxeboreal.test'], { cwd: raiz });
    execFileSync('git', ['config', 'user.name', 'Prueba'], { cwd: raiz });
    const previo = process.env.LUXE_COMMITS_DESDE;
    delete process.env.LUXE_COMMITS_DESDE;
    try {
      const c1 = commitear(raiz, 'chore: inicial');
      execFileSync('git', ['update-ref', 'refs/remotes/origin/main', c1], { cwd: raiz });
      const c2 = commitear(raiz, 'feat(x): segundo commit');

      const rango = resolverRangoDeCommits(raiz);

      expect(rango).toEqual([c2]);
    } finally {
      if (previo !== undefined) {
        process.env.LUXE_COMMITS_DESDE = previo;
      }
      await rm(raiz, { recursive: true, force: true });
    }
  });

  it('LUXE_COMMITS_DESDE fijado a un SHA conocido produce el rango esperado', async () => {
    const raiz = await crearRepositorioDePrueba();
    const previo = process.env.LUXE_COMMITS_DESDE;
    try {
      const c1 = commitear(raiz, 'chore: inicial');
      const c2 = commitear(raiz, 'feat(x): segundo commit');
      const c3 = commitear(raiz, 'fix(y): tercer commit');
      process.env.LUXE_COMMITS_DESDE = c1;

      const rango = resolverRangoDeCommits(raiz);

      expect(new Set(rango)).toEqual(new Set([c2, c3]));
      expect(rango).not.toContain(c1);
    } finally {
      if (previo === undefined) {
        delete process.env.LUXE_COMMITS_DESDE;
      } else {
        process.env.LUXE_COMMITS_DESDE = previo;
      }
      await rm(raiz, { recursive: true, force: true });
    }
  });
});

describe('scripts/verificar-commits — verificarCommits', () => {
  it('rango vacío: termina en verde y lo dice explícitamente en la salida', async () => {
    const raiz = await crearRepositorioDePrueba();
    // Mismo aislamiento que el escenario equivalente de resolverRangoDeCommits (arriba).
    const previo = process.env.LUXE_COMMITS_DESDE;
    delete process.env.LUXE_COMMITS_DESDE;
    try {
      commitear(raiz, 'chore: inicial');

      const resultado = await verificarCommits(raiz);

      expect(resultado.limpio).toBe(true);
      expect(resultado.mensaje.toLowerCase()).toContain('vacío');
    } finally {
      if (previo !== undefined) {
        process.env.LUXE_COMMITS_DESDE = previo;
      }
      await rm(raiz, { recursive: true, force: true });
    }
  });

  it('un mensaje sin tipo convencional en el rango se reporta como inválido', async () => {
    const raiz = await crearRepositorioDePrueba();
    const previo = process.env.LUXE_COMMITS_DESDE;
    try {
      const c1 = commitear(raiz, 'chore: inicial');
      commitear(raiz, 'arreglo cosas');
      process.env.LUXE_COMMITS_DESDE = c1;

      const resultado = await verificarCommits(raiz, { directorioConfiguracion: raizDelProyecto });

      expect(resultado.limpio).toBe(false);
    } finally {
      if (previo === undefined) {
        delete process.env.LUXE_COMMITS_DESDE;
      } else {
        process.env.LUXE_COMMITS_DESDE = previo;
      }
      await rm(raiz, { recursive: true, force: true });
    }
  });

  it('un commit con atribución de IA en el rango se reporta como inválido', async () => {
    const raiz = await crearRepositorioDePrueba();
    const previo = process.env.LUXE_COMMITS_DESDE;
    try {
      const c1 = commitear(raiz, 'chore: inicial');
      await writeFile(path.join(raiz, 'x.txt'), 'x', 'utf8');
      execFileSync('git', ['add', 'x.txt'], { cwd: raiz });
      execFileSync(
        'git',
        [
          'commit',
          '--quiet',
          '-m',
          'feat(x): algo',
          '-m',
          'Co-Authored-By: Un Asistente <asistente@ejemplo.com>',
        ],
        { cwd: raiz },
      );
      process.env.LUXE_COMMITS_DESDE = c1;

      const resultado = await verificarCommits(raiz, { directorioConfiguracion: raizDelProyecto });

      expect(resultado.limpio).toBe(false);
      expect(resultado.mensaje).toContain('atribuci');
    } finally {
      if (previo === undefined) {
        delete process.env.LUXE_COMMITS_DESDE;
      } else {
        process.env.LUXE_COMMITS_DESDE = previo;
      }
      await rm(raiz, { recursive: true, force: true });
    }
  });

  it('todos los commits válidos del rango terminan en verde', async () => {
    const raiz = await crearRepositorioDePrueba();
    const previo = process.env.LUXE_COMMITS_DESDE;
    try {
      const c1 = commitear(raiz, 'chore: inicial');
      commitear(raiz, 'feat(x): algo válido');
      process.env.LUXE_COMMITS_DESDE = c1;

      const resultado = await verificarCommits(raiz, { directorioConfiguracion: raizDelProyecto });

      expect(resultado.limpio).toBe(true);
    } finally {
      if (previo === undefined) {
        delete process.env.LUXE_COMMITS_DESDE;
      } else {
        process.env.LUXE_COMMITS_DESDE = previo;
      }
      await rm(raiz, { recursive: true, force: true });
    }
  });
});
