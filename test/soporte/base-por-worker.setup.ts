import { Client } from 'pg';
import { beforeAll, inject } from 'vitest';
import { NOMBRE_PLANTILLA, identificadorDeWorker, nombreBaseDeWorker } from './bases-de-prueba.js';

const MAX_REINTENTOS = 5;
const SQLSTATE_PLANTILLA_OCUPADA = '55006';

interface ErrorPg {
  readonly code?: string;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

async function crearBaseConReintento(cliente: Client, nombreBase: string): Promise<void> {
  for (let intento = 1; intento <= MAX_REINTENTOS; intento += 1) {
    try {
      // Reintento secuencial, no paralelo, ante el mismo SQLSTATE (55006: plantilla ocupada por
      // otro worker clonándola al mismo tiempo) — clonar la plantilla dos veces a la vez no
      // tendría sentido.
      await cliente.query(`CREATE DATABASE "${nombreBase}" TEMPLATE "${NOMBRE_PLANTILLA}"`);
      return;
    } catch (error) {
      const errorPg = error as ErrorPg;
      if (errorPg.code !== SQLSTATE_PLANTILLA_OCUPADA || intento === MAX_REINTENTOS) {
        throw error;
      }
      await esperar(100 * intento);
    }
  }
}

/**
 * `setupFiles` de los proyectos `integracion` y `e2e` (T1, D6 de `design.md`): por el aislamiento
 * por archivo de Vitest, este módulo se vuelve a ejecutar para cada archivo de test, así que el
 * `beforeAll` de abajo corre una vez por archivo. Recrea `test_<poolId>_<pid>` desde cero, clonada
 * de `plantilla_luxe` (ya migrada por `contenedores.global-setup.ts`), para que cada archivo
 * empiece con una base vacía que solo ve su propio worker.
 *
 * Hallazgo real (Fase 05, confirmado en CI con logs de diagnóstico, nunca visto en local): usar
 * solo `VITEST_POOL_ID` no basta — el planificador de Vitest puede asignar el mismo poolId a dos
 * procesos hijos distintos cuando varios archivos terminan casi al mismo tiempo, causando que dos
 * archivos compitan por (o compartan en vivo) la misma base. `process.pid` sí es único entre
 * procesos del sistema operativo corriendo a la vez (`identificadorDeWorker`).
 */
beforeAll(async () => {
  const urlAdmin = inject('urlPostgresAdmin');
  const nombreBase = nombreBaseDeWorker(identificadorDeWorker(process.env.VITEST_POOL_ID ?? '', process.pid));

  const cliente = new Client({ connectionString: urlAdmin });
  await cliente.connect();
  try {
    await cliente.query(`DROP DATABASE IF EXISTS "${nombreBase}" WITH (FORCE)`);
    await crearBaseConReintento(cliente, nombreBase);
  } finally {
    await cliente.end();
  }
}, 60_000);
