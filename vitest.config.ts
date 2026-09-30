import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Receta "SWC → Vitest" de NestJS (https://docs.nestjs.com/recipes/swc, D7 de
// openspec/changes/fase-00a-esqueleto/design.md): Vitest transforma con esbuild, que no emite
// `emitDecoratorMetadata`; sin ese metadato la inyección por tipo de clase de Nest falla.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    root: './',
    // 20 s (el default de Vitest es 5 s): T6 (fase 00b) agregó un tercer archivo de test que
    // lanza contenedores Docker reales en paralelo con los ya existentes de T1 (gitleaks) y T5
    // (oasdiff) — bajo esa contención real (medida en la máquina de desarrollo, Windows +
    // virtualización de Docker Desktop), subprocesos de git triviales (`merge-base`, `rev-list`)
    // que normalmente responden en milisegundos empezaron a superar el timeout por defecto de
    // Vitest de forma intermitente, sin que el comportamiento de los scripts cambiara. Subir el
    // timeout por defecto es honesto (no oculta un fallo real, D8 de fase 00b); no se bajó la
    // cantidad de tests con Docker ni se serializó todo el proyecto `unit` porque eso alargaría
    // cada corrida local y de CI sin necesidad.
    testTimeout: 20_000,
    // D15 de openspec/changes/fase-00b-ci-contrato-api/design.md: umbral = max(60, floor(medido /
    // 5) * 5 - 5), medido con `npm run test:cobertura` sobre el estado final de 00a+00b (T7,
    // 2026-09-25): 88.03% de líneas → floor(88.03/5)*5-5 = 80. MUST coincidir con
    // `coverage_threshold` de `openspec/config.yaml`. `ci` corre `test:cobertura` (no `test` +
    // `test:integracion` por separado, D8/T6), así que este umbral bloquea de verdad.
    coverage: {
      thresholds: {
        lines: 80,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: [
            'src/**/*.spec.ts',
            'test/fakes/**/*.spec.ts',
            'test/fronteras/**/*.spec.ts',
            'test/contrato/**/*.spec.ts',
            // T1 (fase-01-persistencia, D6/D7): funciones puras del arnés de bases de prueba, sin
            // tocar ningún Postgres real.
            'test/soporte/**/*.spec.ts',
            // T10 (fase-03-importador-medios): esta lista no incluía `scripts/`, así que
            // `scripts/importar-catalogo.spec.ts` (parseo puro de argumentos, sin infraestructura)
            // nunca corría bajo `npm test` — desviación reportada, no silenciosa, corregida aquí.
            'scripts/**/*.spec.ts',
            // Fase 07c (T1): aserciones, umbral, esquema de casos, guion y resumen de las evals son
            // funciones puras; los casos contra el agente corren en el proyecto `evals`.
            'test/evals/**/*.spec.ts',
          ],
          exclude: ['test/fronteras/fixtures/**'],
          // El límite de cuatro workers evita que los tests unitarios que lanzan Docker, Git y
          // CLIs saturen el host mientras se prepara el proyecto de integración de T2.
          maxWorkers: 4,
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'integracion',
          include: ['test/integracion/**/*.spec.ts'],
          // Testcontainers (D1 de openspec/changes/fase-00a-esqueleto/design.md): levanta
          // Postgres 16 + Redis 7 reales una sola vez por corrida de este proyecto.
          globalSetup: ['test/soporte/contenedores.global-setup.ts'],
          // T1 (D6): cada archivo de test de integración recrea su propia base `test_<poolId>`
          // clonada de la plantilla, antes de que corra ningún test de ese archivo.
          setupFiles: ['test/soporte/base-por-worker.setup.ts'],
          // L3 de 00b + D6 de fase-01: el `beforeAll` de clonado corre bajo la contención real de
          // Docker; el default de 10 s es el mismo riesgo que ya midió 00b. `testTimeout` (20 s,
          // global, sin cambio) ya absorbe la contención de los tests individuales.
          hookTimeout: 60_000,
          // D6 de fase-01: con el esquema y las migraciones de T2, `npm run verify` superó 150 s
          // y los procesos de Docker/Prisma agotaron timeouts bajo el paralelismo sin límite. El
          // tope de cuatro workers mantiene la contención dentro del presupuesto medido.
          maxWorkers: 4,
          // Hallazgo real (Fase 05, no anticipado por D6): `maxWorkers` limita procesos del SO,
          // pero Vitest igual puede interlazar varios archivos dentro del MISMO worker vía
          // promesas (`maxConcurrency`, default 5) — el diseño de `base-por-worker.setup.ts`
          // asume que un `VITEST_POOL_ID` procesa un archivo a la vez, de punta a punta. Sin este
          // límite, dos archivos con el mismo poolId corren su `beforeAll` (`DROP DATABASE
          // "test_<poolId>" WITH (FORCE)` + `CREATE DATABASE`) al mismo tiempo: confirmado en CI
          // (nunca en local) con `duplicate key value violates unique constraint
          // "pg_database_datname_index"` y, peor, un archivo activo recibiendo `Code: 57P01,
          // terminating connection due to administrator command` — el DROP de un archivo hermano
          // matando la conexión de otro a mitad de test. `maxConcurrency: 1` fuerza a Vitest a
          // terminar un archivo completo (setup, tests y limpieza) antes de empezar el siguiente
          // en el mismo worker, que es la garantía que D6 ya pretendía dar.
          maxConcurrency: 1,
          // Vitest exige groupOrder distinto al de `unit` cuando los proyectos tienen distintos
          // maxWorkers; ejecutar integración después del unitario también evita competir por Docker.
          sequence: { groupOrder: 1 },
        },
      },
      {
        extends: true,
        test: {
          name: 'evals',
          include: ['test/evals/**/*.evals.ts'],
          // Fase 07c (D1, D7): las evals componen la aplicación completa sobre Postgres y Redis reales,
          // igual que integración y e2e, y comparten su arnés de base por worker.
          globalSetup: ['test/soporte/contenedores.global-setup.ts'],
          setupFiles: ['test/soporte/base-por-worker.setup.ts'],
          hookTimeout: 60_000,
          // El modo real llama a un LLM de verdad (perfil `evals`, 30 s por intento, 3 repeticiones).
          testTimeout: 180_000,
          // Mismo hallazgo que integración y e2e: un archivo a la vez por worker.
          maxConcurrency: 1,
          sequence: { groupOrder: 2 },
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.e2e-spec.ts'],
          // Testcontainers (D1, extendido a e2e en T9): el arranque completo de la app
          // (test/e2e/aplicacion.e2e-spec.ts) necesita Postgres 16 + Redis 7 reales, igual que el
          // proyecto `integracion`.
          globalSetup: ['test/soporte/contenedores.global-setup.ts'],
          // T1 (D6): mismo arnés de base por worker que `integracion`.
          setupFiles: ['test/soporte/base-por-worker.setup.ts'],
          hookTimeout: 60_000,
          // Mismo hallazgo que el proyecto `integracion` (ver ese comentario): sin este límite,
          // Vitest puede interlazar archivos del mismo worker y hacerlos competir por
          // `test_<poolId>`.
          maxConcurrency: 1,
        },
      },
    ],
  },
});
