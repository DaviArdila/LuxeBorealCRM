import type { ClaveSistema } from '../dominio/sistema.js';

/** Token de inyección del puerto {@link RepositorioCasos}. */
export const REPOSITORIO_CASOS = Symbol('REPOSITORIO_CASOS');

/** Un caso con clave del sistema tal como lo guarda la base: su texto y cuándo se escribió por última vez. */
export interface CasoDelSistema {
  readonly texto: string;
  readonly actualizado: Date;
}

/**
 * Lectura y escritura de los casos del sistema (CAS4, CAS7). Las lecturas pueden lanzar: quien las llama decide cómo seguir
 * (el puerto de textos cae al respaldo). La clave siempre es de la lista cerrada: la API no crea casos con otra (CAS4).
 */
export interface RepositorioCasos {
  /** Clave del sistema → texto de los casos con clave del sistema que tienen un texto guardado (aunque sea en blanco). */
  leerTextosDelSistema(): Promise<ReadonlyMap<string, string>>;
  /** Clave del sistema → texto y fecha de escritura, de los casos con clave del sistema que existen. */
  leerCasosDelSistema(): Promise<ReadonlyMap<string, CasoDelSistema>>;
  /** Reemplaza el texto del caso (lo crea con su título y categoría de la lista cerrada si falta). `ahora` es del `Clock`. */
  guardarTextoDelSistema(clave: ClaveSistema, texto: string, ahora: Date): Promise<void>;
  /** Crea el caso solo si no existe y devuelve si lo creó; nunca modifica uno existente. */
  crearTextoDelSistemaSiFalta(clave: ClaveSistema, texto: string, ahora: Date): Promise<boolean>;
}
