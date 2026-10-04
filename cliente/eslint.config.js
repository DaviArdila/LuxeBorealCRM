// @ts-check
import angular from 'angular-eslint';
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

// Fronteras de D10 (openspec/changes/archive/2026-10-04-fase-11b-cliente-angular/design.md), probadas con código que
// las viola en test/fronteras/cliente-fronteras.spec.ts de la raíz. Sin el resolvedor de TypeScript
// los imports sin extensión quedan sin resolver y ninguna regla de fronteras actúa, sin avisar.
const ELEMENTOS = [
  { type: 'registro', pattern: 'src/app/areas/registro', partialMatch: false }, // antes que `area`
  { type: 'area', pattern: 'src/app/areas/*', partialMatch: false, capture: ['area'] },
  { type: 'api', pattern: 'src/app/api', partialMatch: false },
  { type: 'nucleo', pattern: 'src/app/nucleo', partialMatch: false },
  { type: 'compartido', pattern: 'src/app/compartido', partialMatch: false },
  { type: 'sesion', pattern: 'src/app/sesion', partialMatch: false },
  { type: 'shell', pattern: 'src/app/shell', partialMatch: false },
];

/** @param {string[]} tipos */
const hacia = (...tipos) => ({ to: { element: { types: { anyOf: tipos } } } });

export default tseslint.config(
  { ignores: ['dist/', '.angular/', 'coverage/', 'src/app/api/'] },
  {
    files: ['**/*.ts'],
    extends: [
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': ['error', { type: 'attribute', prefix: 'app', style: 'camelCase' }],
      '@angular-eslint/component-selector': ['error', { type: 'element', prefix: 'app', style: 'kebab-case' }],
      // CLT1: el cliente jamás importa código del servidor; su única relación es el contrato. El
      // servidor vive en `servicio/` (ADR-0023); `src|scripts|test` cubren las rutas de antes.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)\\.\\./(\\.\\./)*(servicio|src|scripts|test)(/|$)',
              message: 'CLT1: el cliente no importa código del servidor; usa el cliente generado desde el contrato.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/app/**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {},
  },
  {
    files: ['src/app/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.json' } },
      'boundaries/include': ['src/app/**/*'],
      'boundaries/elements': ELEMENTOS,
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            { from: { element: { type: 'api' } }, allow: hacia('api') },
            { from: { element: { type: 'nucleo' } }, allow: hacia('nucleo', 'api') },
            { from: { element: { type: 'compartido' } }, allow: hacia('compartido') },
            { from: { element: { type: 'sesion' } }, allow: hacia('sesion', 'nucleo', 'compartido', 'api') },
            { from: { element: { type: 'shell' } }, allow: hacia('shell', 'nucleo', 'compartido', 'registro') },
            { from: { element: { type: 'registro' } }, allow: hacia('registro', 'nucleo', 'area') },
            { from: { element: { type: 'area' } }, allow: hacia('nucleo', 'compartido', 'api') },
            {
              // su propia carpeta; nunca otra área
              from: { element: { type: 'area' } },
              allow: { to: { element: { type: 'area', captured: { area: '{{ from.element.captured.area }}' } } } },
            },
          ],
        },
      ],
    },
  },
);
