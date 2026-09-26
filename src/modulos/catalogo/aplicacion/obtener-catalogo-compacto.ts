import { Injectable } from '@nestjs/common';
import { armarCatalogoCompacto } from '../dominio/producto.js';
import { ListarProductosActivos } from './listar-productos-activos.js';

/**
 * Caso de uso del catálogo compacto (design.md "Data Flow", CAT4): compone el texto sin precios a
 * partir de `ListarProductosActivos.ejecutar()` (misma ruta de caché que CAT1/CAT5) llamando a
 * `armarCatalogoCompacto` (dominio, D6) — esta clase no reimplementa el formateo ni el orden.
 */
@Injectable()
export class ObtenerCatalogoCompacto {
  constructor(private readonly listarProductosActivos: ListarProductosActivos) {}

  async ejecutar(): Promise<string> {
    const productos = await this.listarProductosActivos.ejecutar();
    return armarCatalogoCompacto(productos);
  }
}
