import { inject } from 'vitest';
import { nombreBaseDeWorker, urlConBase } from './bases-de-prueba.js';

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
  const nombreBase = nombreBaseDeWorker(process.env.VITEST_POOL_ID ?? '');
  return urlConBase(urlAdmin, nombreBase);
}

/** URL de administración del contenedor Redis de prueba (D1); sin cambio en la Fase 01. */
export function urlRedisDePrueba(): string {
  return inject('urlRedisAdmin');
}

/**
 * Prefijo de claves de Redis por worker (`test:<VITEST_POOL_ID>:`), nuevo en la Fase 01 (D6).
 * Ningún test de esta fase escribe claves todavía; queda listo para la primera fase que lo haga
 * (04-05, ADR-0009).
 */
export function prefijoRedisDePrueba(): string {
  const poolId = process.env.VITEST_POOL_ID ?? '';
  if (!/^\d+$/.test(poolId)) {
    throw new Error(`poolId de Vitest inválido para el prefijo de Redis: "${poolId}" (MUST cumplir ^\\d+$).`);
  }
  return `test:${poolId}:`;
}
