import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  construirArgumentosDocker,
  resolverRaizRepositorio,
} from '../../scripts/herramientas.js';

/**
 * `scripts/herramientas.ts` (D10, matriz de amenazas de `tasks.md`: "Selección del repositorio
 * git"). `resolverRaizRepositorio` MUST devolver la raíz real del repositorio sin importar desde
 * qué subdirectorio se invoque, y sin partirse cuando esa raíz tiene espacios en la ruta (la ruta
 * real de este repositorio los tiene: "Project Dani").
 */
describe('scripts/herramientas — resolverRaizRepositorio', () => {
  it('devuelve la raíz del repositorio real, no el subdirectorio, al resolver desde test/fronteras', () => {
    const raizEsperada = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
    }).trim();

    const raiz = resolverRaizRepositorio(import.meta.dirname);

    expect(raiz).toBe(raizEsperada);
    expect(raiz).not.toBe(import.meta.dirname);
  });

  it('resuelve correctamente desde una ruta con espacios (repositorio de prueba aislado)', async () => {
    const carpetaConEspacio = await mkdtemp(path.join(tmpdir(), 'luxe prueba raiz '));
    execFileSync('git', ['init', '--quiet'], { cwd: carpetaConEspacio });
    execFileSync('git', ['config', 'user.email', 'prueba@luxeboreal.test'], {
      cwd: carpetaConEspacio,
    });
    execFileSync('git', ['config', 'user.name', 'Prueba'], { cwd: carpetaConEspacio });
    execFileSync('git', ['commit', '--allow-empty', '--quiet', '-m', 'chore: inicial'], {
      cwd: carpetaConEspacio,
    });
    const subdirectorio = path.join(carpetaConEspacio, 'un sub directorio');

    try {
      const raizReal = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: carpetaConEspacio,
        encoding: 'utf8',
      }).trim();

      const raiz = resolverRaizRepositorio(carpetaConEspacio);

      expect(raiz).toBe(raizReal);
      expect(raiz).toContain(' ');
      // Nunca la raíz de este repositorio (que también tiene espacios): deben ser aislados.
      expect(raiz).not.toBe(
        execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(),
      );
    } finally {
      await rm(carpetaConEspacio, { recursive: true, force: true });
      void subdirectorio;
    }
  });

  it('nombra el problema y no cae a "." cuando git rev-parse falla', () => {
    // Un directorio que no existe hace fallar el spawn de git (ENOENT en el cwd), en vez de
    // depender de encontrar una máquina sin ningún repositorio git ancestro (esta misma máquina
    // tiene el home del usuario como repositorio git, CLAUDE.md §Repositorio).
    const carpetaInexistente = path.join(tmpdir(), 'luxe-carpeta-que-no-existe-jamas');

    expect(() => resolverRaizRepositorio(carpetaInexistente)).toThrowError(/rev-parse/);
  });
});

describe('scripts/herramientas — construirArgumentosDocker', () => {
  it('construye un array de argumentos exacto, nunca una cadena concatenada', () => {
    const argumentos = construirArgumentosDocker('imagen:tag@sha256:abc', ['detect', '-v'], {
      montarDesde: 'C:/Users/ASUS/Desktop/Project Dani/LuxeBorealCRM',
      montarEn: '/repo',
    });

    expect(argumentos).toEqual([
      'run',
      '--rm',
      '-v',
      'C:/Users/ASUS/Desktop/Project Dani/LuxeBorealCRM:/repo',
      'imagen:tag@sha256:abc',
      'detect',
      '-v',
    ]);
  });

  it('la ruta con espacios queda en un único elemento del array, no partida en dos', () => {
    const argumentos = construirArgumentosDocker('imagen', [], {
      montarDesde: 'C:/Users/ASUS/Desktop/Project Dani/LuxeBorealCRM',
    });
    const indiceMontaje = argumentos.indexOf('-v') + 1;

    expect(argumentos[indiceMontaje]).toBe(
      'C:/Users/ASUS/Desktop/Project Dani/LuxeBorealCRM:/repo',
    );
    expect(argumentos.filter((a) => a.includes('Project'))).toHaveLength(1);
  });

  it('agrega -w cuando se indica directorioTrabajo', () => {
    const argumentos = construirArgumentosDocker('imagen', ['comando'], {
      montarDesde: '/tmp/x',
      directorioTrabajo: '/repo/sub',
    });

    expect(argumentos).toContain('-w');
    expect(argumentos[argumentos.indexOf('-w') + 1]).toBe('/repo/sub');
  });
});
