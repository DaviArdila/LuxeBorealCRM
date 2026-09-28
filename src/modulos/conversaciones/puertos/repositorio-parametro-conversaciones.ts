/** Token de inyección del puerto {@link RepositorioParametroConversaciones} (D13 de `design.md`). */
export const REPOSITORIO_PARAMETRO_CONVERSACIONES = Symbol('REPOSITORIO_PARAMETRO_CONVERSACIONES');

/**
 * Repositorio de parámetros propio de `conversaciones` (D13, Q1 de la proposal): sin módulo
 * `configuracion` compartido, igual que `catalogo` tiene el suyo. Solo lee las claves que este
 * módulo declara.
 */
export interface RepositorioParametroConversaciones {
  /** Default embebido si la fila `mensaje_espera_handoff` no existe (R15: dato de negocio, no constante). */
  obtenerMensajeEsperaHandoff(): Promise<string>;
}
