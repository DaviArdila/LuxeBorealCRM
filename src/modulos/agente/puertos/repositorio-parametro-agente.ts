export type { ClaveTextoAgente } from '../dominio/textos-fijos.js';
import type { ClaveTextoAgente } from '../dominio/textos-fijos.js';

/** Token de inyección del puerto {@link RepositorioParametroAgente}. */
export const REPOSITORIO_PARAMETRO_AGENTE = Symbol('REPOSITORIO_PARAMETRO_AGENTE');

/** Repositorio de parámetros propio del agente (D9): mismo patrón que el de `conversaciones` y `llm`. */
export interface RepositorioParametroAgente {
  /** Nunca lanza por «no configurado»: cae al texto de respaldo, definido en un solo lugar (AGT3). */
  obtenerTexto(clave: ClaveTextoAgente): Promise<string>;
}
