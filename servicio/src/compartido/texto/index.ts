/**
 * Superficie pública de `compartido/texto` (CMP3). Nadie fuera de este módulo importa rutas
 * internas (`./texto.js`).
 */
export {
  contieneMarcadorDePlantilla,
  contieneSku,
  contieneValorEnPesos,
  normalizarLugar,
  normalizarTexto,
  palabrasClave,
} from './texto.js';
