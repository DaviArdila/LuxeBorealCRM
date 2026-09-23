// @ts-check
import tseslint from 'typescript-eslint';

// Config mínima para T2 (esqueleto vacío). Las reglas de fronteras "Reloj"/"Entorno"/"Consola"
// (D10 de openspec/changes/fase-00a-esqueleto/design.md) se agregan en T7, que amplía este archivo
// sin reemplazarlo.
export default tseslint.config(
  {
    // .kilo/ es el worktree de otra herramienta (CLAUDE.md, "Repositorio") y MUST NOT lintearse
    // ni tocarse desde aquí.
    ignores: ['dist/', 'coverage/', 'src/plataforma/prisma/generado/', '.kilo/'],
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
    files: ['*.ts', '*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
