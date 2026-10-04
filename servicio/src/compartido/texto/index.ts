/**
 * Superficie pública de `compartido/texto` (CMP3). Nadie fuera de este módulo importa rutas
 * internas (`./texto.js`).
 */
export {
  contieneMarcadorDePlantilla,
  contieneValorEnPesos,
  normalizarLugar,
  normalizarTexto,
  palabrasClave,
} from './texto.js';
