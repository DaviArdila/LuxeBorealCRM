/** Token de inyección del puerto {@link InvalidadorDeCaches}. */
export const INVALIDADOR_DE_CACHES = Symbol('INVALIDADOR_DE_CACHES');

/** Descarta las copias que dependen de una clave recién guardada (CFG5). Puede lanzar: quien lo llama conserva lo guardado. */
export interface InvalidadorDeCaches {
  invalidarCatalogo(): Promise<void>;
}
