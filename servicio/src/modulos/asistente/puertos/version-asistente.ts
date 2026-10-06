/** Token de inyección del puerto {@link VersionAsistente}. */
export const VERSION_ASISTENTE = Symbol('VERSION_ASISTENTE');

/**
 * Versión compartida de los casos entre procesos (CAS7, AGT19): un contador que sube con toda escritura de un caso o una
 * categoría y que cada turno compara con la de su copia en memoria, igual que el estilo y `catalogo:version`.
 */
export interface VersionAsistente {
  /** `'0'` si nunca se escribió. Puede lanzar si Redis no responde: quien llama decide cómo seguir. */
  obtener(): Promise<string>;
  incrementar(): Promise<void>;
}
