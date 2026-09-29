import { inject } from 'vitest';
import { NOMBRE_BUCKET_PRUEBA, identificadorDeWorker, nombreBaseDeWorker, urlConBase } from './bases-de-prueba.js';

/**
 * Helper que entrega a cada test de integración/e2e la URL de la base de datos **de su propio
 * worker** (`test_<VITEST_POOL_ID>`). Firma sin cambios desde 00a (D6 de
 * `openspec/changes/fase-01-persistencia/design.md`): sigue siendo síncrona, porque la base ya
 * existe y está migrada cuando el test la pide — la crea `base-por-worker.setup.ts` en un
 * `beforeAll` que corre antes de cualquier test del archivo, clonándola de la plantilla que
 * `contenedores.global-setup.ts` migra una sola vez por corrida.
 */
export function urlPostgresDePrueba(): string {
  const urlAdmin = inject('urlPostgresAdmin');
  const nombreBase = nombreBaseDeWorker(identificadorDeWorker(process.env.VITEST_POOL_ID ?? '', process.pid));
  return urlConBase(urlAdmin, nombreBase);
}

/** URL de administración del contenedor Redis de prueba (D1); sin cambio en la Fase 01. */
export function urlRedisDePrueba(): string {
  return inject('urlRedisAdmin');
}

/**
 * Prefijo de claves de Redis por worker (`test:<poolId>_<pid>:`), nuevo en la Fase 01 (D6). Usa el
 * mismo identificador `<poolId>_<pid>` que `urlPostgresDePrueba` (ver `identificadorDeWorker`):
 * `VITEST_POOL_ID` solo no es único entre procesos concurrentes (Fase 05).
 */
export function prefijoRedisDePrueba(): string {
  const identificador = identificadorDeWorker(process.env.VITEST_POOL_ID ?? '', process.pid);
  if (!/^[0-9]+_[0-9]+$/.test(identificador)) {
    throw new Error(
      `Identificador de worker inválido para el prefijo de Redis: "${identificador}" ` +
        `(MUST cumplir ^[0-9]+_[0-9]+$).`,
    );
  }
  return `test:${identificador}:`;
}

/**
 * Clave del interruptor global del bot (`bot:activo`) con el prefijo del worker. La clave real es una
 * sola para todo el sistema, así que dos archivos de integración que la escriban en paralelo se
 * pisan (el bot aparecía apagado para el otro archivo); los tests usan esta clave propia.
 */
export function claveInterruptorDePrueba(): string {
  return `${prefijoRedisDePrueba()}bot:activo`;
}

/** URL de administración del contenedor MinIO de prueba (D9, T5 de fase-03-importador-medios). */
export function urlMinioDePrueba(): string {
  return inject('urlMinioAdmin');
}

/** Credenciales del contenedor MinIO de prueba, generadas por `contenedores.global-setup.ts` (D9). */
export function credencialesMinioDePrueba(): { accessKeyId: string; secretAccessKey: string } {
  return {
    accessKeyId: inject('minioAccessKeyId'),
    secretAccessKey: inject('minioSecretAccessKey'),
  };
}

/** Nombre del bucket MinIO compartido entre los tests de integración (D9, T5). */
export function bucketMinioDePrueba(): string {
  return NOMBRE_BUCKET_PRUEBA;
}
