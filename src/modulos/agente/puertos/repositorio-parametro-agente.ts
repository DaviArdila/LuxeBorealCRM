/** Claves de `parametro` con los textos fijos que el agente envía sin pasar por el LLM (AGT3, R15). */
export type ClaveTextoAgente =
  | 'mensaje_pedir_texto_audio'
  | 'mensaje_imagen_no_procesada'
  | 'aviso_datos'
  | 'mensaje_handoff'
  | 'mensaje_handoff_fuera_horario';

/** Token de inyección del puerto {@link RepositorioParametroAgente}. */
export const REPOSITORIO_PARAMETRO_AGENTE = Symbol('REPOSITORIO_PARAMETRO_AGENTE');

/** Repositorio de parámetros propio del agente (D9): mismo patrón que el de `conversaciones` y `llm`. */
export interface RepositorioParametroAgente {
  /** Nunca lanza por «no configurado»: cae al texto de respaldo, definido en un solo lugar (AGT3). */
  obtenerTexto(clave: ClaveTextoAgente): Promise<string>;
}
