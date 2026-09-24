// commitlint.config.js — Conventional Commits (CI2) + regla propia `sin-atribucion-ia` (D13 de
// openspec/changes/fase-00b-ci-contrato-api/design.md, CLAUDE.md §"Cómo se trabaja"). ESM porque
// el proyecto es "type": "module" (package.json); commitlint 21+ carga configuraciones ESM sin
// necesidad de cambiar la extensión a .mjs.

/** Líneas que delatan atribución de IA, sin importar mayúsculas/minúsculas. */
const PATRONES_ATRIBUCION_IA = [/co-authored-by/i, /generated with/i, /\u{1F916}/u];

/**
 * @param {string} mensajeCrudo
 * @returns {boolean}
 */
function tieneAtribucionIA(mensajeCrudo) {
  return PATRONES_ATRIBUCION_IA.some((patron) => patron.test(mensajeCrudo));
}

/** @type {import('@commitlint/types').Plugin} */
const pluginSinAtribucionIa = {
  rules: {
    'sin-atribucion-ia': (parsed) => {
      const encontrada = tieneAtribucionIA(parsed.raw ?? '');
      return [
        !encontrada,
        'el mensaje de commit no puede incluir una línea de atribución de IA ' +
          '(Co-Authored-By, "Generated with" o el emoji de robot) — CLAUDE.md §"Cómo se trabaja"',
      ];
    },
  },
};

/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [pluginSinAtribucionIa],
  rules: {
    'sin-atribucion-ia': [2, 'always'],
  },
};
