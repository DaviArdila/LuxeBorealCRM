import { inject } from 'vitest';

/**
 * Helper que entrega a cada test de integración/e2e la URL de administración de los contenedores
 * de Testcontainers levantados por `contenedores.global-setup.ts` (D1). En la Fase 01 este mismo
 * helper pasa a crear la base de datos del worker (`CREATE DATABASE test_<poolId>`) y a devolver
 * esa URL en vez de la de administración, sin que los tests que lo llaman cambien.
 */
export function urlPostgresDePrueba(): string {
  return inject('urlPostgresAdmin');
}

/** URL de administración del contenedor Redis de prueba (D1); en 01+ se le suma un prefijo de claves por worker. */
export function urlRedisDePrueba(): string {
  return inject('urlRedisAdmin');
}
