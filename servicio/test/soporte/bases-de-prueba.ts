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

const IDENTIFICADOR_VALIDO = /^[0-9]+_[0-9]+$/;

/**
 * Arma el identificador `<poolId>_<pid>` de este proceso de worker. Hallazgo real (Fase 05, nunca
 * visto en local): `VITEST_POOL_ID` NO es único entre procesos concurrentes — confirmado en CI con
 * dos PID distintos recibiendo el mismo poolId al mismo tiempo cuando el planificador de Vitest
 * despachaba dos archivos nuevos casi simultáneamente, causando `CREATE DATABASE "test_<poolId>"`
 * duplicado y, peor, dos archivos compartiendo la misma base en vivo. `process.pid` sí es único
 * entre procesos del sistema operativo corriendo al mismo tiempo, así que combinarlo con el poolId
 * elimina la colisión sin depender del comportamiento interno del planificador.
 */
export function identificadorDeWorker(poolId: string, pid: number): string {
  return `${poolId}_${pid}`;
}

/**
 * Arma el nombre de la base de datos del worker (`test_<identificador>`). El nombre de base se usa
 * como identificador dentro de SQL crudo (`CREATE DATABASE`, `DROP DATABASE`) que no admite
 * parámetros — por eso esta función MUST lanzar **antes** de que cualquier llamador arme esa
 * sentencia, ante cualquier `identificador` que no sea exactamente `<dígitos>_<dígitos>` (matriz de
 * amenazas de `tasks.md`: subproceso/identificadores de `test/soporte`).
 */
export function nombreBaseDeWorker(identificador: string): string {
  if (!IDENTIFICADOR_VALIDO.test(identificador)) {
    throw new Error(
      `Identificador de worker inválido para nombrar una base de prueba: "${identificador}" ` +
        `(MUST cumplir ^[0-9]+_[0-9]+$).`,
    );
  }
  return `test_${identificador}`;
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
