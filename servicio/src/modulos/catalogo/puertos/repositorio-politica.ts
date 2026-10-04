/** Token de inyección del puerto {@link RepositorioPolitica}. */
export const REPOSITORIO_POLITICA = Symbol('REPOSITORIO_POLITICA');

/**
 * Puerto de lectura de las políticas del negocio (CAT12): filas `politica_<tema>` de `parametro`
 * (R15). Solo devuelve lo configurado; el texto de respaldo lo aplica el caso de uso.
 */
export interface RepositorioPolitica {
  /** Texto de la política del tema, o `null` si no está configurada. */
  obtener(tema: string): Promise<string | null>;
  /** Temas con política configurada, sin orden garantizado. */
  listarTemas(): Promise<string[]>;
}
