import type { ProductoResumen } from '../dominio/producto.js';

/** Token de inyección del puerto {@link CacheCatalogo} (design.md D2, "Puertos y adaptadores"). */
export const CACHE_CATALOGO = Symbol('CACHE_CATALOGO');

/**
 * Puerto de la caché de catálogo compacto (design.md D2, CAT4, CAT5): un *provider* de NestJS con
 * estado de instancia, nunca un `let` de módulo. Guarda el resumen de productos activos
 * ({@link ProductoResumen}), sin ningún valor de dinero — el texto sin precios lo arma
 * `armarCatalogoCompacto` (dominio) a partir de lo que devuelve {@link obtenerVigente}.
 */
export interface CacheCatalogo {
  /**
   * Copia vigente, o `null` si no hay copia válida (nunca leída todavía, versión desactualizada
   * respecto a `catalogo:version`, o TTL de respaldo vencido). `null` le indica a quien llama que
   * MUST recargar desde el origen de datos y llamar {@link reemplazar} (CAT4).
   */
  obtenerVigente(): Promise<readonly ProductoResumen[] | null>;
  /** Guarda una copia nueva, fijada a la versión vigente en el momento de la llamada (CAT4). */
  reemplazar(productos: readonly ProductoResumen[]): Promise<void>;
  /**
   * Descarta la copia de este proceso e incrementa la clave de versión compartida en Redis, para
   * que cualquier otro proceso que la comparta también la descarte en su siguiente lectura (CAT5).
   */
  invalidar(): Promise<void>;
}
