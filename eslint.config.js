// @ts-check
import tseslint from 'typescript-eslint';

// Reglas de fronteras de D10 (openspec/changes/fase-00a-esqueleto/design.md, T7), probadas en
// test/fronteras/eslint.spec.ts. En flat config un bloque posterior REEMPLAZA (no fusiona) el
// valor de una regla ya definida para el mismo archivo — por eso los selectores se extraen a
// constantes y cada zona (Reloj/Entorno/Consola) arma su propio bloque `files`/`ignores` mutuamente
// excluyente para `no-restricted-syntax`, en vez de dejar que dos bloques se pisen entre sí.
const SELECTORES_RELOJ = [
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message:
      'Reloj: usa el puerto Clock inyectado (token CLOCK) en vez de Date.now() (design D10, PLT2).',
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message:
      'Reloj: usa el puerto Clock inyectado (token CLOCK) en vez de new Date() sin argumentos ' +
      '(design D10, PLT2).',
  },
  {
    selector: "CallExpression[callee.name='Date']",
    message:
      'Reloj: Date() sin new devuelve la hora como texto; usa el puerto Clock inyectado ' +
      '(design D10, PLT2).',
  },
  {
    selector: "MemberExpression[object.name='Temporal'][property.name='Now']",
    message: 'Reloj: usa el puerto Clock inyectado (token CLOCK) en vez de Temporal.Now (design D10, PLT2).',
  },
];

const SELECTOR_ENTORNO = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message:
    'Entorno: process.env solo se lee dentro de plataforma/config; inyecta la Configuracion ' +
    'validada en el resto del código (design D10, PLT1).',
};

const MENSAJE_IMPORT_ENTORNO =
  'Entorno: no importes env de process/node:process fuera de plataforma/config (design D10, PLT1).';

const RESTRICCION_IMPORT_ENTORNO = [
  'error',
  {
    paths: [
      { name: 'process', importNames: ['env'], message: MENSAJE_IMPORT_ENTORNO },
      { name: 'node:process', importNames: ['env'], message: MENSAJE_IMPORT_ENTORNO },
    ],
  },
];

export default tseslint.config(
  {
    // .kilo/ es el worktree de otra herramienta (CLAUDE.md, "Repositorio") y MUST NOT lintearse
    // ni tocarse desde aquí. test/fronteras/fixtures/ contiene violaciones a propósito (D11): se
    // lintean solo desde sus propios tests (test/fronteras/eslint.spec.ts), nunca por `npm run
    // lint` directamente.
    ignores: [
      'dist/',
      'coverage/',
      'src/plataforma/prisma/generado/',
      'test/fronteras/fixtures/',
      '.kilo/',
    ],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['*.ts', '*.js', '*.cjs', '*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  // Consola: no-console aplica a todos los archivos procesados por ESLint, incluidos archivos
  // JavaScript de configuración y TypeScript de la aplicación y sus tests (D10).
  {
    rules: {
      'no-console': 'error',
    },
  },
  // Entorno: aplica a src/** salvo plataforma/config/** (D10); regla distinta de
  // no-restricted-syntax, así que no compite por la misma zona con los bloques de Reloj de abajo.
  {
    files: ['src/**/*.ts'],
    ignores: ['src/plataforma/config/**'],
    rules: {
      'no-restricted-imports': RESTRICCION_IMPORT_ENTORNO,
    },
  },
  // Zona 1 — test/**: solo Reloj aplica (Entorno es exclusivo de src/**, D10).
  {
    files: ['test/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...SELECTORES_RELOJ],
    },
  },
  // Zona 2 — plataforma/reloj/**: excepción de Reloj; Entorno sigue aplicando aquí (su única
  // excepción es plataforma/config/**).
  {
    files: ['src/plataforma/reloj/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', SELECTOR_ENTORNO],
    },
  },
  // Zona 3 — plataforma/config/**: excepción de Entorno; Reloj sigue aplicando aquí (su única
  // excepción es plataforma/reloj/**).
  {
    files: ['src/plataforma/config/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...SELECTORES_RELOJ],
    },
  },
  // Zona 4 — resto de src/**: ni la excepción de Reloj ni la de Entorno aplican; ambas reglas
  // conviven en un único array (mismo `no-restricted-syntax`, D10).
  {
    files: ['src/**/*.ts'],
    ignores: ['src/plataforma/reloj/**', 'src/plataforma/config/**'],
    rules: {
      'no-restricted-syntax': ['error', ...SELECTORES_RELOJ, SELECTOR_ENTORNO],
    },
  },
);
