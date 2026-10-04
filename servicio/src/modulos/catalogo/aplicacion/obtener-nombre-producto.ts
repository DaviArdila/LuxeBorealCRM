import { Inject, Injectable } from '@nestjs/common';
import { REPOSITORIO_PRODUCTO, type RepositorioProducto } from '../puertos/repositorio-producto.js';

/**
 * Nombre de un producto por su id (D6 de la Fase 08d, NTF1): para que el aviso al asesor diga de qué producto se
 * trata. Devuelve solo el nombre, nunca el SKU (AGT16) ni el precio. A diferencia de la ficha (CAT3), un producto
 * inactivo conserva su nombre: el aviso es interno y el lead pudo nacer cuando el producto estaba activo.
 */
@Injectable()
export class ObtenerNombreProducto {
  constructor(@Inject(REPOSITORIO_PRODUCTO) private readonly repositorio: RepositorioProducto) {}

  async ejecutar(idProducto: string): Promise<string | null> {
    const producto = await this.repositorio.buscarPorIdOSku(idProducto);
    return producto === null ? null : producto.nombre;
  }
}
