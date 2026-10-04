import { defineConfig } from 'vitest/config';

// Pruebas de las herramientas del cliente (ADR-0023): fronteras del lint, proxy de desarrollo y
// generación y deriva del cliente HTTP. Corren en Node, aparte de los tests de componentes que
// ejecuta `ng test` (jsdom), con `npm run test:herramientas`.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['herramientas/**/*.spec.ts'],
    testTimeout: 60_000,
  },
});
