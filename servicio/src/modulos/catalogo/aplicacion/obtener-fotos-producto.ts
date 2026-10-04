import { Inject, Injectable } from '@nestjs/common';
import type { AnguloFoto } from '../dominio/angulo-foto.js';
import { angulosDeFotos, armarLeyendaFoto, ProductoNoDisponible, type FotosProducto } from '../dominio/producto.js';
import { REPOSITORIO_PRODUCTO, type RepositorioProducto } from '../puertos/repositorio-producto.js';

/**
 * Caso de uso de fotos de un producto (CAT14, D4 de la Fase 07b; portada y ángulo en la 08b): rechaza un
 * producto inexistente o inactivo como la ficha (CAT3) y devuelve **una** foto: la portada si no se pide
 * ángulo, o la primera foto de ese ángulo. Junto con la clave de objeto (MED1: nunca rutas ni URLs) entrega
 * los ángulos disponibles y el pie de foto armado aquí con el precio formateado por el backend (AGT17, R2).
 */
@Injectable()
export class ObtenerFotosProducto {
  constructor(@Inject(REPOSITORIO_PRODUCTO) private readonly repositorioProducto: RepositorioProducto) {}

  async ejecutar(idOSku: string, angulo?: AnguloFoto): Promise<FotosProducto> {
    const producto = await this.repositorioProducto.buscarPorIdOSku(idOSku);
    if (!producto || !producto.activo) {
      throw new ProductoNoDisponible();
    }
    const fotos = await this.repositorioProducto.listarFotos(producto.id);
    const foto = angulo === undefined ? (fotos[0] ?? null) : (fotos.find((candidata) => candidata.angulo === angulo) ?? null);
    return { foto, angulosDisponibles: angulosDeFotos(fotos), leyenda: armarLeyendaFoto(producto) };
  }
}
