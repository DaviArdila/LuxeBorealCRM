/** Token de inyección del puerto {@link RepositorioCasos}. */
export const REPOSITORIO_CASOS = Symbol('REPOSITORIO_CASOS');

/** Lectura de los casos que necesita el puerto de textos (CAS7). Puede lanzar: quien lo llama cae al respaldo. */
export interface RepositorioCasos {
  /** Clave del sistema → texto de los casos con clave del sistema que tienen un texto guardado (aunque sea en blanco). */
  leerTextosDelSistema(): Promise<ReadonlyMap<string, string>>;
}
