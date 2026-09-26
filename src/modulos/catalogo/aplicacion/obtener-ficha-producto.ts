import { Inject, Injectable } from '@nestjs/common';
import { armarFicha, ProductoNoDisponible, type FichaProducto } from '../dominio/producto.js';
import { REPOSITORIO_PARAMETRO_CATALOGO, type RepositorioParametroCatalogo } from '../puertos/repositorio-parametro.js';
import { REPOSITORIO_PRODUCTO, type RepositorioProducto } from '../puertos/repositorio-producto.js';

/**
 * Caso de uso de ficha de producto (design.md "Data Flow", CAT2/CAT3): orquestador fino que busca
 * el producto por id o SKU y lo rechaza (`ProductoNoDisponible`, sin ningún dato del producto) si no
 * existe o está inactivo (CAT3); si está activo, arma la ficha con `armarFicha` (dominio, D6) y el
 * recargo contraentrega leído de `REPOSITORIO_PARAMETRO_CATALOGO` (R15).
 */
@Injectable()
export class ObtenerFichaProducto {
  constructor(
    @Inject(REPOSITORIO_PRODUCTO) private readonly repositorioProducto: RepositorioProducto,
    @Inject(REPOSITORIO_PARAMETRO_CATALOGO) private readonly repositorioParametro: RepositorioParametroCatalogo,
  ) {}

  async ejecutar(idOSku: string): Promise<FichaProducto> {
    const producto = await this.repositorioProducto.buscarPorIdOSku(idOSku);
    if (!producto || !producto.activo) {
      throw new ProductoNoDisponible();
    }

    const recargoContraentregaPct = await this.repositorioParametro.obtenerRecargoContraentregaPct();
    return armarFicha(producto, recargoContraentregaPct);
  }
}
