import { z } from 'zod';
import { ProductoNoDisponible, type ObtenerFichaProducto } from '../../../catalogo/index.js';
import type { Herramienta } from '../../dominio/herramienta.js';
import { definirHerramienta } from './definir-herramienta.js';

const esquema = z.object({
  id_producto: z.string().min(1).describe('El id o el SKU del producto, tal como lo devolvió buscar_producto.'),
});

/**
 * `obtener_ficha` (AGT8): envuelve `ObtenerFichaProducto`. El precio llega ya formateado por el backend
 * (`precio_texto`, R2); un producto inexistente o inactivo vuelve como error explícito sin ningún dato
 * suyo (CAT3), para que el modelo no lo cite.
 */
export function crearObtenerFicha(ficha: ObtenerFichaProducto): Herramienta {
  return definirHerramienta(
    'obtener_ficha',
    'Devuelve la ficha de un producto activo: nombre, descripción larga, precio ya formateado y si tiene fotos. Es la única fuente de precios.',
    esquema,
    async ({ id_producto }) => {
      try {
        const resultado = await ficha.ejecutar(id_producto);
        return {
          paraElModelo: {
            id: resultado.id,
            sku: resultado.sku,
            nombre: resultado.nombre,
            descripcion_larga: resultado.descripcionLarga,
            precio_texto: resultado.precioTexto,
            tiene_fotos: resultado.tieneFotos,
          },
          efectos: [],
        };
      } catch (error) {
        if (error instanceof ProductoNoDisponible) {
          return {
            paraElModelo: { error: 'Ese producto no existe o no está disponible. Usa buscar_producto para encontrar uno vigente.' },
            efectos: [],
          };
        }
        throw error;
      }
    },
  );
}
