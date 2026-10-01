/** Token de inyección del puerto {@link VersionEstilo}. */
export const VERSION_ESTILO = Symbol('VERSION_ESTILO');

/**
 * Versión compartida del estilo entre procesos (AGT19, ADR-0020): un contador que sube al publicar o restaurar y
 * que cada turno compara con la de su copia en memoria, igual que `catalogo:version` (CAT5).
 */
export interface VersionEstilo {
  /** `'0'` si nunca se publicó. Puede lanzar si Redis no responde: quien llama decide cómo seguir. */
  obtener(): Promise<string>;
  incrementar(): Promise<void>;
}
