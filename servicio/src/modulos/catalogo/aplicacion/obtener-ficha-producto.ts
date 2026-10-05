import { Inject, Injectable } from '@nestjs/common';
import { angulosDeFotos, armarFicha, ProductoNoDisponible, type FichaProducto } from '../dominio/producto.js';
import { REPOSITORIO_PRODUCTO, type RepositorioProducto } from '../puertos/repositorio-producto.js';

/**
 * Caso de uso de ficha de producto (design.md "Data Flow", CAT2/CAT3): orquestador fino que busca
 * el producto por id o SKU y lo rechaza (`ProductoNoDisponible`, sin ningún dato del producto) si no
 * existe o está inactivo (CAT3); si está activo, arma la ficha con `armarFicha` (dominio, D6) y le suma los
 * ángulos de sus fotos para que el modelo sepa qué puede pedir (D4 de la 08b). La ficha no
 * expone el recargo contra entrega: lo que el cliente debe saber lo da la política (CAT12).
 */
@Injectable()
export class ObtenerFichaProducto {
  constructor(
    @Inject(REPOSITORIO_PRODUCTO) private readonly repositorioProducto: RepositorioProducto,
  ) {}

  async ejecutar(idOSku: string): Promise<FichaProducto> {
    const producto = await this.repositorioProducto.buscarPorIdOSku(idOSku);
    if (!producto || !producto.activo) {
      throw new ProductoNoDisponible();
    }

    const fotos = await this.repositorioProducto.listarFotos(producto.id);
    return armarFicha(producto, angulosDeFotos(fotos));
  }
}
