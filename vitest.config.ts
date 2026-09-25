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
          // Vitest exige groupOrder distinto al de `unit` cuando los proyectos tienen distintos
          // maxWorkers; ejecutar integración después del unitario también evita competir por Docker.
          sequence: { groupOrder: 1 },
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
        },
      },
    ],
  },
});
