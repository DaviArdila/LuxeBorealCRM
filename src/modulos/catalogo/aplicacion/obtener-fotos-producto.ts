import { Inject, Injectable } from '@nestjs/common';
import { ProductoNoDisponible, type FotosProducto } from '../dominio/producto.js';
import { REPOSITORIO_PRODUCTO, type RepositorioProducto } from '../puertos/repositorio-producto.js';

/**
 * Caso de uso de fotos de un producto (CAT14, D4 de la Fase 07b): rechaza un producto inexistente o
 * inactivo como la ficha (CAT3) y devuelve solo claves de objeto (MED1): el collage si existe y hasta
 * `maximo` fotos individuales en el orden de envío del repositorio (portada primero). Nunca rutas ni URLs.
 */
@Injectable()
export class ObtenerFotosProducto {
  constructor(@Inject(REPOSITORIO_PRODUCTO) private readonly repositorioProducto: RepositorioProducto) {}

  async ejecutar(idOSku: string, maximo: number): Promise<FotosProducto> {
    const producto = await this.repositorioProducto.buscarPorIdOSku(idOSku);
    if (!producto || !producto.activo) {
      throw new ProductoNoDisponible();
    }
    const fotos = await this.repositorioProducto.listarFotos(producto.id);
    return { claveCollage: fotos.claveCollage, clavesFotos: fotos.clavesFotos.slice(0, Math.max(0, maximo)) };
  }
}
