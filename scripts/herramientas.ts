import { execFileSync, spawn } from 'node:child_process';

/**
 * Imágenes Docker fijadas (etiqueta + digest exactos) para los binarios Go que la Fase 00b usa sin
 * compilarlos localmente (D10 de `openspec/changes/fase-00b-ci-contrato-api/design.md`). Actualizar
 * una herramienta es cambiar una de estas tres constantes; el digest garantiza el mismo contenido en
 * la máquina de desarrollo y en el runner de CI, sin importar a qué apunte la etiqueta más adelante.
 *
 * Digests confirmados el 2026-09-24 con `docker pull` real desde esta máquina (registrado en
 * `openspec/changes/fase-00b-ci-contrato-api/tasks.md`, T1, checkpoint (e)). `oasdiff` no publica
 * una etiqueta semver estable conocida; se fija por `latest` + digest, que sigue siendo determinista
 * porque Docker resuelve por el digest, no por la etiqueta.
 */
export const IMAGEN_GITLEAKS =
  'zricethezav/gitleaks:v8.21.2@sha256:0e99e8821643ea5b235718642b93bb32486af9c8162c8b8731f7cbdc951a7f46';
export const IMAGEN_OASDIFF =
  'tufin/oasdiff:latest@sha256:0286f138545a39010525df6c1bea67ffafacb384ef800effffa63bbd04718ce5';
export const IMAGEN_ACTIONLINT =
  'rhysd/actionlint:1.7.7@sha256:887a259a5a534f3c4f36cb02dca341673c6089431057242cdc931e9f133147e9';

/**
 * Resuelve la raíz absoluta del repositorio con `git rev-parse --show-toplevel` (matriz de amenazas
 * de `tasks.md`: "Selección del repositorio git"). Nunca usa `process.cwd()` directamente ni acepta
 * la raíz por argumento del script que la llama — siempre se resuelve una vez, aquí, con git. Si se
 * pasa `directorioDesdeDondeResolver` (uso de test: ejercitar la resolución desde un subdirectorio o
 * desde una ruta con espacios), `git` corre con ese directorio como `cwd`; en producción se omite y
 * se usa el directorio de trabajo real del proceso.
 */
export function resolverRaizRepositorio(directorioDesdeDondeResolver: string = process.cwd()): string {
  let salida: string;
  try {
    salida = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: directorioDesdeDondeResolver,
      encoding: 'utf8',
    });
  } catch (error) {
    throw new Error(
      `No se pudo resolver la raíz del repositorio con "git rev-parse --show-toplevel" ` +
        `desde "${directorioDesdeDondeResolver}": ${(error as Error).message}`,
    );
  }
  const raiz = salida.trim();
  if (raiz.length === 0) {
    throw new Error(
      `"git rev-parse --show-toplevel" no devolvió ninguna ruta desde "${directorioDesdeDondeResolver}".`,
    );
  }
  return raiz;
}

export interface OpcionesEjecutarHerramienta {
  /** Directorio real que se monta como origen; por defecto la raíz completa del repositorio. */
  readonly montarDesde?: string;
  /** Punto de montaje dentro del contenedor; por defecto `/repo`. */
  readonly montarEn?: string;
  /** Directorio de trabajo (`-w`) dentro del contenedor para el proceso lanzado. */
  readonly directorioTrabajo?: string;
}

export interface ResultadoHerramienta {
  readonly codigo: number;
  readonly salida: string;
  readonly salidaError: string;
}

/**
 * Construye el array de argumentos de `docker run` a partir de la imagen, los argumentos del
 * binario y las opciones de montaje — función pura, separada de `ejecutarHerramienta`, para que un
 * test la ejercite sin lanzar Docker de verdad y afirme el array exacto (nunca una cadena
 * concatenada; matriz de amenazas de `tasks.md`: rutas con espacios no se parten en dos argumentos).
 */
export function construirArgumentosDocker(
  imagen: string,
  argumentos: readonly string[],
  opciones: OpcionesEjecutarHerramienta = {},
): string[] {
  const raiz = opciones.montarDesde ?? resolverRaizRepositorio();
  const destino = opciones.montarEn ?? '/repo';
  const argumentosDocker: string[] = ['run', '--rm', '-v', `${raiz}:${destino}`];
  if (opciones.directorioTrabajo) {
    argumentosDocker.push('-w', opciones.directorioTrabajo);
  }
  argumentosDocker.push(imagen, ...argumentos);
  return argumentosDocker;
}

/**
 * Ejecuta una imagen Docker fijada con `spawn` y **array de argumentos** (nunca `shell: true` ni
 * concatenación de cadenas), monta el repositorio (o el directorio que indique `montarDesde`) y
 * propaga el código de salida. Si Docker no responde, la promesa se rechaza nombrando Docker
 * Desktop explícitamente — nunca pasa en verde ni cae a un camino alternativo silencioso (D10).
 */
export function ejecutarHerramienta(
  imagen: string,
  argumentos: readonly string[],
  opciones: OpcionesEjecutarHerramienta = {},
): Promise<ResultadoHerramienta> {
  const argumentosDocker = construirArgumentosDocker(imagen, argumentos, opciones);

  return new Promise((resolve, reject) => {
    const proceso = spawn('docker', argumentosDocker, { shell: false });
    let salida = '';
    let salidaError = '';

    proceso.stdout.on('data', (fragmento: Buffer) => {
      salida += fragmento.toString('utf8');
    });
    proceso.stderr.on('data', (fragmento: Buffer) => {
      salidaError += fragmento.toString('utf8');
    });
    proceso.on('error', (error) => {
      reject(
        new Error(
          `No se pudo ejecutar Docker (¿Docker Desktop está corriendo?): ${error.message}`,
        ),
      );
    });
    proceso.on('close', (codigo) => {
      resolve({ codigo: codigo ?? 1, salida, salidaError });
    });
  });
}
