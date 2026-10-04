import load from '@commitlint/load';
import lint from '@commitlint/lint';
import type { ParserOptions } from 'conventional-commits-parser';
import { execFileSync } from 'node:child_process';
import { resolverRaizRepositorio, resolverRaizServicio } from './herramientas.js';

/**
 * `commits` (CI2, D8, D13). Verifica con `commitlint` cada commit del rango
 * `merge-base(main, HEAD)..HEAD` — u override explícito con `LUXE_COMMITS_DESDE` al rebasar (D8,
 * matriz de amenazas de `tasks.md`: "Estado del push"). Un rango vacío (la rama está al día con
 * `main`) MUST terminar en verde sin analizar ningún commit, dejándolo dicho en la salida (matriz de
 * amenazas: "Estado del índice").
 */
export interface ResultadoVerificacionCommits {
  readonly limpio: boolean;
  readonly mensaje: string;
}

const RAMA_BASE = 'main';
const REFS_RAMA_BASE = [`refs/heads/${RAMA_BASE}`, `refs/remotes/origin/${RAMA_BASE}`];

/**
 * `refs/heads/main` existe en un checkout local normal, pero `actions/checkout` (D8, `fetch-depth:
 * 0`) sobre cualquier ref que no sea `main` (el caso normal de un push a rama de fase o un PR) deja
 * `main` únicamente como `refs/remotes/origin/main`, sin crear la rama local — mismo problema que
 * D11 resuelve en `comparar-contrato.ts`. Se intentan ambas referencias, en ese orden.
 */
function resolverRamaBase(raiz: string): string {
  for (const ref of REFS_RAMA_BASE) {
    try {
      execFileSync('git', ['-C', raiz, 'rev-parse', '--verify', '--quiet', ref], {
        encoding: 'utf8',
      });
      return ref;
    } catch {
      continue;
    }
  }
  throw new Error(
    `No se encontró ninguna referencia de ${RAMA_BASE} (se intentó: ${REFS_RAMA_BASE.join(', ')}).`,
  );
}

function calcularDesde(raiz: string): string {
  const desdeVariable = process.env.LUXE_COMMITS_DESDE;
  if (desdeVariable !== undefined && desdeVariable.trim().length > 0) {
    return desdeVariable.trim();
  }
  return execFileSync('git', ['-C', raiz, 'merge-base', resolverRamaBase(raiz), 'HEAD'], {
    encoding: 'utf8',
  }).trim();
}

/**
 * Lista los SHA del rango a verificar, del más antiguo al más reciente. Nunca cae a `.` ni a un
 * rango implícito: si `git merge-base`/`git rev-list` fallan, la excepción se propaga nombrando el
 * comando (matriz de amenazas: "Selección del repositorio git").
 */
export function resolverRangoDeCommits(raiz: string = resolverRaizRepositorio()): string[] {
  const desde = calcularDesde(raiz);
  const salida = execFileSync('git', ['-C', raiz, 'rev-list', '--reverse', `${desde}..HEAD`], {
    encoding: 'utf8',
  });
  return salida
    .split('\n')
    .map((sha) => sha.trim())
    .filter((sha) => sha.length > 0);
}

function obtenerMensajeCommit(raiz: string, sha: string): string {
  return execFileSync('git', ['-C', raiz, 'log', '-1', '--format=%B', sha], {
    encoding: 'utf8',
  });
}

export interface OpcionesVerificarCommits {
  /**
   * Dónde buscar `commitlint.config.js` (cosmiconfig). Por defecto, la misma `raiz` que se
   * inspecciona — en producción son siempre el mismo repositorio. Los tests de este script separan
   * ambos: inspeccionan un repositorio git aislado y descartable, pero validan contra las reglas
   * reales del proyecto (este repositorio), nunca contra una copia reimplementada de la config.
   */
  readonly directorioConfiguracion?: string;
}

export async function verificarCommits(
  raiz: string = resolverRaizRepositorio(),
  opciones: OpcionesVerificarCommits = {},
): Promise<ResultadoVerificacionCommits> {
  const rango = resolverRangoDeCommits(raiz);
  if (rango.length === 0) {
    return {
      limpio: true,
      mensaje: 'commits: rango vacío (la rama está al día con main); no se analizó ningún commit.',
    };
  }

  const config = await load({}, { cwd: opciones.directorioConfiguracion ?? resolverRaizServicio() });
  const invalidos: string[] = [];

  for (const sha of rango) {
    const mensaje = obtenerMensajeCommit(raiz, sha);
    const resultado = await lint(mensaje, config.rules, {
      plugins: config.plugins,
      parserOpts: config.parserPreset?.parserOpts as ParserOptions | undefined,
      ignores: config.ignores,
      defaultIgnores: config.defaultIgnores,
    });
    if (!resultado.valid) {
      const errores = resultado.errors.map((error) => error.message).join('; ');
      invalidos.push(`${sha.slice(0, 12)}: ${errores}`);
    }
  }

  if (invalidos.length === 0) {
    return {
      limpio: true,
      mensaje: `commits: ${rango.length} commit(s) verificados en el rango, todos válidos.`,
    };
  }

  return {
    limpio: false,
    mensaje: `commits: ${invalidos.length} de ${rango.length} commit(s) inválidos:\n${invalidos.join('\n')}`,
  };
}
