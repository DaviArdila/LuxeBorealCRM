import type { PlanSemilla } from '../dominio/semilla.js';

/** Token de inyección del puerto {@link RepositorioSemilla}. */
export const REPOSITORIO_SEMILLA = Symbol('REPOSITORIO_SEMILLA');

/** Lo que la semilla lee y escribe en la base (CAS6); la única vía por la que `asistente` toca `parametro`. */
export interface RepositorioSemilla {
  /** Las filas de `parametro` de texto: las claves de los casos del sistema, `aviso_datos` (texto legado que hereda `consentimiento_aviso`) y toda `politica_<tema>`, con su valor crudo. */
  leerParametrosDeTexto(): Promise<ReadonlyMap<string, unknown>>;
  /** El texto de la fila de sistema legada `aviso_datos`, o `null` si no existe; solo lectura (ADR-0028, CAS14). */
  leerTextoLegadoDelAviso(): Promise<unknown>;
  /**
   * Crea las categorías y los casos del plan que aún no existen (sin pisar ninguno) y retira de `parametro` las filas de
   * las que copió un texto, todo en una sola transacción: si algo falla no queda nada a medias. Devuelve cuántos casos
   * insertó.
   */
  aplicar(plan: PlanSemilla, ahora: Date): Promise<number>;
}
