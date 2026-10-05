import { Inject, Injectable } from '@nestjs/common';
import type { ProductoResumen } from '../dominio/producto.js';
import { CACHE_CATALOGO, type CacheCatalogo } from '../puertos/cache-catalogo.js';
import { REPOSITORIO_PRODUCTO, type RepositorioProducto } from '../puertos/repositorio-producto.js';

/**
 * Caso de uso de listado de productos activos (design.md "Data Flow", CAT1/CAT4/CAT5):
 * orquestador fino que pide la copia vigente a `CACHE_CATALOGO` antes de tocar el repositorio
 * (CAT4); si no hay copia válida, lee `REPOSITORIO_PRODUCTO.listarActivosResumen()` (ya excluye
 * inactivos y ordena por nombre) y la guarda en caché para la siguiente lectura (CAT5).
 */
@Injectable()
export class ListarProductosActivos {
  constructor(
    @Inject(REPOSITORIO_PRODUCTO) private readonly repositorioProducto: RepositorioProducto,
    @Inject(CACHE_CATALOGO) private readonly cache: CacheCatalogo,
  ) {}

  async ejecutar(): Promise<readonly ProductoResumen[]> {
    const vigente = await this.cache.obtenerVigente();
    if (vigente) return vigente;

    const productos = await this.repositorioProducto.listarActivosResumen();
    await this.cache.reemplazar(productos);
    return productos;
  }
}
