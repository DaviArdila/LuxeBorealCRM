import type { Producto, ProductoResumen } from '../dominio/producto.js';

/** Token de inyección del puerto {@link RepositorioProducto} (design.md, "Puertos y adaptadores"). */
export const REPOSITORIO_PRODUCTO = Symbol('REPOSITORIO_PRODUCTO');

/**
 * Puerto de acceso a `producto` (design.md, tabla "Puertos y adaptadores"). Solo lectura: ningún
 * caso de uso de esta fase escribe en `producto` todavía.
 */
export interface RepositorioProducto {
  /** Solo activos, ordenado por `nombre` (CAT1, CAT4). */
  listarActivosResumen(): Promise<readonly ProductoResumen[]>;
  /** Busca por `id` o por `sku`; `null` si no existe, sin filtrar por `activo` (lo decide CAT3 en T8). */
  buscarPorIdOSku(idOSku: string): Promise<Producto | null>;
}
