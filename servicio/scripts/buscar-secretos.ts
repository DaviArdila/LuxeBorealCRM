import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ejecutarHerramienta, IMAGEN_GITLEAKS, resolverRaizRepositorio } from './herramientas.js';
import type { ResultadoHerramienta } from './herramientas.js';

/**
 * `secretos` (CI3, D8, D10). Detección de secretos con `gitleaks` sobre el **árbol de trabajo**
 * (incluye cambios sin *stage*, matriz de amenazas de `tasks.md`: "Estado del índice"), y sobre el
 * **historial** completo de commits (`secretos:historial`, más lento, solo en `ci`, D8).
 */
export interface ResultadoBusquedaSecretos {
  readonly limpio: boolean;
  readonly mensaje: string;
}

/**
 * Lista, con `git ls-files`, todos los archivos rastreados y los no rastreados que **no** están
 * ignorados (`--exclude-standard`): es exactamente la forma del árbol de trabajo, respetando
 * `.gitignore` sin tener que enumerar a mano `node_modules/`, `dist/`, `coverage/` ni el cliente
 * Prisma generado. Copiar solo esos archivos a un directorio temporal y montar **ese** directorio
 * (en vez de la raíz completa del repositorio) es lo que mantiene el escaneo dentro del presupuesto
 * de 60 s del hook: montar la raíz completa con `node_modules/` instalado (miles de archivos) tomó
 * ~56-65 s solo por el costo de la virtualización de archivos de Docker Desktop en Windows, medido
 * en la máquina real de esta tarea; montar solo el árbol de trabajo real toma bajo 2 s.
 */
function listarArchivosDelArbol(raiz: string): string[] {
  const salida = execFileSync(
    'git',
    ['-C', raiz, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 },
  );
  return salida.split('\0').filter((ruta) => ruta.length > 0);
}

async function copiarArbolDeTrabajoATemporal(raiz: string): Promise<string> {
  const destino = await mkdtemp(path.join(tmpdir(), 'luxe-secretos-'));
  const archivos = listarArchivosDelArbol(raiz);
  for (const relativa of archivos) {
    const origen = path.join(raiz, relativa);
    const objetivo = path.join(destino, relativa);
    await mkdir(path.dirname(objetivo), { recursive: true });
    await copyFile(origen, objetivo);
  }
  return destino;
}

function interpretarResultadoGitleaks(resultado: ResultadoHerramienta): ResultadoBusquedaSecretos {
  if (resultado.codigo === 0) {
    return { limpio: true, mensaje: 'gitleaks: sin secretos detectados.' };
  }
  return {
    limpio: false,
    mensaje:
      `gitleaks detectó posibles secretos (código de salida ${resultado.codigo}). ` +
      'Revisa el hallazgo abajo; si es un falso positivo, agrégalo a .gitleaks.toml con su motivo ' +
      '(nunca lo desactives por completo):\n' +
      `${resultado.salida}${resultado.salidaError}`,
  };
}

/**
 * Escanea el árbol de trabajo actual (`--arbol` en CLI). Copia solo lo que `git ls-files` reporta
 * a un directorio temporal, escanea ahí con `gitleaks --no-git` y borra el temporal al terminar,
 * incluso si el escaneo falla.
 */
export async function buscarSecretosEnArbol(
  raiz: string = resolverRaizRepositorio(),
): Promise<ResultadoBusquedaSecretos> {
  const staging = await copiarArbolDeTrabajoATemporal(raiz);
  try {
    const resultado = await ejecutarHerramienta(
      IMAGEN_GITLEAKS,
      ['detect', '--source', '/repo', '--no-git', '--redact', '-v', '--exit-code', '1'],
      { montarDesde: staging },
    );
    return interpretarResultadoGitleaks(resultado);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/**
 * Escanea el historial completo de commits (`--historial` en CLI, `secretos:historial`). No copia
 * nada: `gitleaks` en modo git lee el historial vía `.git/`, que ya excluye `node_modules/` por
 * construcción (nunca está en el historial). Deliberadamente más lento que `--arbol`; D8 lo deja
 * fuera del hook y solo corre en `ci`.
 */
export async function buscarSecretosEnHistorial(
  raiz: string = resolverRaizRepositorio(),
): Promise<ResultadoBusquedaSecretos> {
  const resultado = await ejecutarHerramienta(
    IMAGEN_GITLEAKS,
    ['detect', '--source', '/repo', '--redact', '-v', '--exit-code', '1'],
    { montarDesde: raiz },
  );
  return interpretarResultadoGitleaks(resultado);
}
