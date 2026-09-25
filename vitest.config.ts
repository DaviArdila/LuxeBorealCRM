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
          ],
          exclude: ['test/fronteras/fixtures/**'],
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
        },
      },
    ],
  },
});
