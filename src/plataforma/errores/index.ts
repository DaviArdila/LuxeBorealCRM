/**
 * Superficie pública de `plataforma/errores` (D5). Nadie fuera de este módulo importa rutas
 * internas (`./catalogo-codigos.js`, `./construir-problema.js`, `./error-de-aplicacion.js`,
 * `./fabrica-error-validacion.js`, `./filtro-problem-json.js`, `./errores.module.js`) — regla de
 * fronteras `sin-rutas-internas-de-plataforma`.
 */
export { CATALOGO_CODIGOS, type CodigoError } from './catalogo-codigos.js';
export { construirProblema, type DetalleCampo, type Problema } from './construir-problema.js';
export { ErrorDeAplicacion } from './error-de-aplicacion.js';
export { fabricaErrorValidacion, type IssuePathMinimo } from './fabrica-error-validacion.js';
export { FiltroProblemJson } from './filtro-problem-json.js';
export { ErroresModule } from './errores.module.js';
