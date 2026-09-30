import { Injectable } from '@nestjs/common';
import { buscarEnResumen } from '../dominio/buscar.js';
import type { ProductoResumen } from '../dominio/producto.js';
import { ListarProductosActivos } from './listar-productos-activos.js';

/**
 * Búsqueda de productos activos por palabras clave (CAT13): orquestador fino sobre el listado
 * cacheado de activos (CAT4), así que no consulta la base por cada búsqueda; la regla de búsqueda
 * vive en el dominio (`buscarEnResumen`). Sin precio (CAT1).
 */
@Injectable()
export class BuscarProductos {
  constructor(private readonly listarProductosActivos: ListarProductosActivos) {}

  async ejecutar(texto: string): Promise<readonly ProductoResumen[]> {
    return buscarEnResumen(await this.listarProductosActivos.ejecutar(), texto);
  }
}
