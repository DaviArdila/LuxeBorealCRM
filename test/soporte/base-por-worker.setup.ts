import { Client } from 'pg';
import { beforeAll, inject } from 'vitest';
import { NOMBRE_PLANTILLA, nombreBaseDeWorker } from './bases-de-prueba.js';

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
 * `beforeAll` de abajo corre una vez por archivo. Recrea `test_<poolId>` desde cero, clonada de
 * `plantilla_luxe` (ya migrada por `contenedores.global-setup.ts`), para que cada archivo empiece
 * con una base vacía que solo ve su propio worker.
 */
// DIAGNOSTICO TEMPORAL — quitar junto con esta función tras confirmar si el poolId se reutiliza
// en el borde unit→integracion de `test:cobertura` (fix/actionlint-temp-dir-permisos).
function diag(fase: string, nombreBase: string): void {
  // eslint-disable-next-line no-restricted-syntax -- diagnóstico temporal, no lógica de negocio
  const t = Date.now();
  // eslint-disable-next-line no-console -- diagnóstico temporal, se lee del log crudo de CI
  console.error(`DIAG poolId=${process.env.VITEST_POOL_ID} pid=${process.pid} db=${nombreBase} t=${t} fase=${fase}`);
}

beforeAll(async () => {
  const urlAdmin = inject('urlPostgresAdmin');
  const nombreBase = nombreBaseDeWorker(process.env.VITEST_POOL_ID ?? '');
  diag('inicio', nombreBase);

  const cliente = new Client({ connectionString: urlAdmin });
  await cliente.connect();
  try {
    await cliente.query(`DROP DATABASE IF EXISTS "${nombreBase}" WITH (FORCE)`);
    diag('despues-drop', nombreBase);
    await crearBaseConReintento(cliente, nombreBase);
    diag('despues-create', nombreBase);
  } finally {
    await cliente.end();
  }
}, 60_000);
