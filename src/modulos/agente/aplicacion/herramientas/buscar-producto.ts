import { z } from 'zod';
import type { BuscarProductos } from '../../../catalogo/index.js';
import type { Herramienta } from '../../dominio/herramienta.js';
import { definirHerramienta } from './definir-herramienta.js';

const esquema = z.object({
  query: z.string().min(1).describe('Palabras del producto que busca el cliente, p. ej. "anillo oro".'),
});

/**
 * `buscar_producto` (AGT8): envuelve `BuscarProductos` de `catalogo` sin recalcular nada. Devuelve
 * hasta 5 productos `{id, nombre, descripcion_corta}` y nunca dinero ni SKU: el precio solo sale de
 * `obtener_ficha` (R1, R2) y el SKU es referencia interna (AGT16).
 */
export function crearBuscarProducto(buscar: BuscarProductos): Herramienta {
  return definirHerramienta(
    'buscar_producto',
    'Busca productos del catálogo por palabras clave. Devuelve hasta 5 con id, nombre y descripción corta; no incluye precios.',
    esquema,
    async ({ query }) => {
      const productos = await buscar.ejecutar(query);
      return {
        paraElModelo: productos.map((producto) => ({
          id: producto.id,
          nombre: producto.nombre,
          descripcion_corta: producto.descripcionCorta,
        })),
        efectos: [],
      };
    },
  );
}
