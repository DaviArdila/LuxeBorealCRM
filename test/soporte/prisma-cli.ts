import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsincrono = promisify(execFile);

const RAIZ_REPOSITORIO = path.resolve(import.meta.dirname, '..', '..');
const CLI_PRISMA = path.join(RAIZ_REPOSITORIO, 'node_modules', 'prisma', 'build', 'index.js');

export interface ResultadoPrismaCli {
  readonly codigo: number;
  readonly salida: string;
  readonly error: string;
}

interface ErrorProcesoHijo {
  readonly code?: number;
  readonly stdout?: string;
  readonly stderr?: string;
}

/**
 * Lanza el CLI de Prisma como subproceso, sin shell (D7 de
 * `openspec/changes/fase-01-persistencia/design.md`, matriz de amenazas de `tasks.md`): binario =
 * `process.execPath`, argumentos en un arreglo fijo (`argumentos`), sin interpolar texto de
 * usuario en ningún comando. Solo se sobrescribe `DATABASE_URL` en el entorno del subproceso;
 * `prisma.config.ts` la lee. Lo usan `contenedores.global-setup.ts` (`migrate deploy` sobre la
 * plantilla) y, en T2, el test de deriva (`migrate diff … --exit-code`).
 */
export async function ejecutarPrismaCli(
  argumentos: readonly string[],
  urlBase: string,
): Promise<ResultadoPrismaCli> {
  try {
    const { stdout, stderr } = await execFileAsincrono(process.execPath, [CLI_PRISMA, ...argumentos], {
      cwd: RAIZ_REPOSITORIO,
      env: { ...process.env, DATABASE_URL: urlBase },
    });
    return { codigo: 0, salida: stdout, error: stderr };
  } catch (error) {
    const errorProceso = error as ErrorProcesoHijo;
    return {
      codigo: errorProceso.code ?? 1,
      salida: errorProceso.stdout ?? '',
      error: errorProceso.stderr ?? String(error),
    };
  }
}
