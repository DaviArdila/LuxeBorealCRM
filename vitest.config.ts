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
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts', 'test/fakes/**/*.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integracion',
          include: ['test/integracion/**/*.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.e2e-spec.ts'],
        },
      },
    ],
  },
});
