import type { FotoProducto, Producto, ProductoResumen } from '../dominio/producto.js';

/** Token de inyección del puerto {@link RepositorioProducto} (design.md, "Puertos y adaptadores"). */
export const REPOSITORIO_PRODUCTO = Symbol('REPOSITORIO_PRODUCTO');

/**
 * Puerto de acceso a `producto` (design.md, tabla "Puertos y adaptadores"). Solo lectura: la
 * escritura del importador (Fase 03, IMP11) vive en un puerto propio,
 * `RepositorioImportacionCatalogo` (`puertos/repositorio-importacion.ts`), no aquí.
 */
export interface RepositorioProducto {
  /** Solo activos, ordenado por `nombre` (CAT1, CAT4). */
  listarActivosResumen(): Promise<readonly ProductoResumen[]>;
  /** Busca por `id` o por `sku`; `null` si no existe, sin filtrar por `activo` (lo decide CAT3 en T8). */
  buscarPorIdOSku(idOSku: string): Promise<Producto | null>;
  /** Fotos de un producto con su ángulo, portada primero y luego por `orden` (CAT14). */
  listarFotos(productoId: string): Promise<readonly FotoProducto[]>;
}
