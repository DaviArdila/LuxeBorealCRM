/** Token de inyección del puerto {@link RepositorioEstilo}. */
export const REPOSITORIO_ESTILO = Symbol('REPOSITORIO_ESTILO');

/** El estilo publicado en `parametro` y su versión (AGT18, AGT21). */
export interface EstiloGuardado {
  readonly texto: string;
  readonly version: number;
}

/**
 * Lectura del estilo editable del agente (ADR-0020). La publicación y el historial se agregan en la T4; aquí
 * solo la lectura, que nunca lanza por «no publicado»: devuelve `null` y rige el archivo de respaldo (AGT18).
 */
export interface RepositorioEstilo {
  leerVigente(): Promise<EstiloGuardado | null>;
}
