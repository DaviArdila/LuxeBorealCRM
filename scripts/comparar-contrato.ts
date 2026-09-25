import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ejecutarHerramienta, IMAGEN_OASDIFF, resolverRaizRepositorio } from './herramientas.js';

/**
 * `contrato:diff` (CI9, API10, D11 de `openspec/changes/fase-00b-ci-contrato-api/design.md`).
 * Compara el documento **público** (`openapi/openapi.json`) de la rama actual contra el
 * commiteado en `main` con `oasdiff`. Política explícita "sin base de comparación" (D11): cada
 * rama deja un rastro distinto en la salida, y ninguna imprime "ok" ni "sin cambios incompatibles"
 * salvo que de verdad haya corrido la comparación:
 *
 * | Situación | Resultado |
 * |---|---|
 * | `main` tiene el documento | corre `oasdiff breaking <base> <actual> --fail-on ERR` |
 * | `main` existe pero no tiene el documento | no falla; imprime "SIN BASE DE COMPARACIÓN" |
 * | no existe la rama `main` o falla `git show` por otra razón | falla, nombra el comando git |
 * | Docker no responde | falla, nombra Docker Desktop (heredado de `ejecutarHerramienta`) |
 */
const ARCHIVO_PUBLICO = 'openapi/openapi.json';
const RAMA_BASE = 'main';

export const MENSAJE_SIN_BASE =
  `oasdiff: SIN BASE DE COMPARACIÓN — ${RAMA_BASE} no tiene ${ARCHIVO_PUBLICO}; ` +
  'este PR no fue comparado';

export interface ResultadoComparacionContrato {
  readonly limpio: boolean;
  readonly mensaje: string;
}

export interface OpcionesCompararContrato {
  /** Inyección de prueba: por defecto, `ejecutarHerramienta` real contra Docker. */
  readonly ejecutarOasdiff?: typeof ejecutarHerramienta;
}

function ramaBaseExiste(raiz: string): boolean {
  try {
    execFileSync('git', ['-C', raiz, 'rev-parse', '--verify', '--quiet', `refs/heads/${RAMA_BASE}`], {
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * `null` cuando la rama existe pero no tiene el archivo (D11: eso es "sin base", no es un fallo).
 * Cualquier otro error de `git show` se propaga: es la rama "falla git show" de D11.
 */
function contenidoEnRamaBase(raiz: string): string | null {
  try {
    return execFileSync('git', ['-C', raiz, 'show', `${RAMA_BASE}:${ARCHIVO_PUBLICO}`], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 32,
    });
  } catch (error) {
    const detalle =
      (error as { stderr?: Buffer | string }).stderr?.toString() ?? (error as Error).message;
    if (/does not exist in|exists on disk, but not in/i.test(detalle)) {
      return null;
    }
    throw error;
  }
}

export async function compararContrato(
  raiz: string = resolverRaizRepositorio(),
  archivoActual: string = path.join(raiz, ARCHIVO_PUBLICO),
  opciones: OpcionesCompararContrato = {},
): Promise<ResultadoComparacionContrato> {
  if (!ramaBaseExiste(raiz)) {
    return {
      limpio: false,
      mensaje:
        `contrato:diff: no se pudo comparar — "git rev-parse --verify refs/heads/${RAMA_BASE}" ` +
        `no encontró la rama ${RAMA_BASE}.`,
    };
  }

  let base: string | null;
  try {
    base = contenidoEnRamaBase(raiz);
  } catch (error) {
    return {
      limpio: false,
      mensaje:
        `contrato:diff: no se pudo comparar — "git show ${RAMA_BASE}:${ARCHIVO_PUBLICO}" falló: ` +
        `${(error as Error).message}`,
    };
  }

  if (base === null) {
    return { limpio: true, mensaje: MENSAJE_SIN_BASE };
  }

  const ejecutar = opciones.ejecutarOasdiff ?? ejecutarHerramienta;
  const directorioTemporal = await mkdtemp(path.join(tmpdir(), 'luxe-oasdiff-'));
  try {
    const rutaBase = path.join(directorioTemporal, 'base.json');
    const rutaActual = path.join(directorioTemporal, 'actual.json');
    const actual = await readFile(archivoActual, 'utf8');
    await Promise.all([writeFile(rutaBase, base, 'utf8'), writeFile(rutaActual, actual, 'utf8')]);

    const resultado = await ejecutar(
      IMAGEN_OASDIFF,
      ['breaking', '/repo/base.json', '/repo/actual.json', '--fail-on', 'ERR'],
      { montarDesde: directorioTemporal },
    );

    if (resultado.codigo === 0) {
      return {
        limpio: true,
        mensaje: `contrato:diff: sin cambios incompatibles contra ${RAMA_BASE}.`,
      };
    }
    return {
      limpio: false,
      mensaje:
        `contrato:diff: oasdiff detectó cambios incompatibles contra ${RAMA_BASE}:\n` +
        `${resultado.salida}${resultado.salidaError}`,
    };
  } catch (error) {
    return {
      limpio: false,
      mensaje: `contrato:diff: no se pudo ejecutar oasdiff: ${(error as Error).message}`,
    };
  } finally {
    await rm(directorioTemporal, { recursive: true, force: true });
  }
}
