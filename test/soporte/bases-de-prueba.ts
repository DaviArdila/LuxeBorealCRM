/**
 * Funciones y constantes puras del arnés de bases/objetos de prueba (T1 de
 * `openspec/changes/fase-01-persistencia/tasks.md`, D6/D7 de `design.md`; T5 de
 * `fase-03-importador-medios`, D9, agrega el nombre del bucket MinIO de prueba). Ningún I/O aquí:
 * quien conecta a Postgres/MinIO es `base-por-worker.setup.ts` y `contenedores.global-setup.ts`.
 */

/** Nombre de la base plantilla, migrada una sola vez por `contenedores.global-setup.ts` (D6). */
export const NOMBRE_PLANTILLA = 'plantilla_luxe';

/** Nombre del bucket MinIO compartido entre los tests de integración (D9, T5). */
export const NOMBRE_BUCKET_PRUEBA = 'luxeboreal-medios-prueba';

const POOL_ID_VALIDO = /^\d+$/;

/**
 * Arma el nombre de la base de datos del worker (`test_<poolId>`). El nombre de base se usa como
 * identificador dentro de SQL crudo (`CREATE DATABASE`, `DROP DATABASE`) que no admite
 * parámetros — por eso esta función MUST lanzar **antes** de que cualquier llamador arme esa
 * sentencia, ante cualquier `poolId` que no sea exactamente uno o más dígitos (matriz de amenazas
 * de `tasks.md`: subproceso/identificadores de `test/soporte`).
 */
export function nombreBaseDeWorker(poolId: string): string {
  if (!POOL_ID_VALIDO.test(poolId)) {
    throw new Error(
      `poolId de Vitest inválido para nombrar una base de prueba: "${poolId}" (MUST cumplir ^\\d+$).`,
    );
  }
  return `test_${poolId}`;
}

/**
 * Devuelve `urlAdmin` con la ruta cambiada a `/nombreBase`, conservando usuario, clave, host,
 * puerto y query string. `urlAdmin` es la URL de administración del contenedor de Testcontainers
 * (`urlPostgresAdmin`, ver `contenedores.global-setup.ts`).
 */
export function urlConBase(urlAdmin: string, nombreBase: string): string {
  const url = new URL(urlAdmin);
  url.pathname = `/${nombreBase}`;
  return url.toString();
}
