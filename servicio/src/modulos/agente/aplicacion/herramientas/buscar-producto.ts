import { z } from 'zod';
import type { BuscarProductos, ObtenerFichaProducto } from '../../../catalogo/index.js';
import type { Herramienta } from '../../dominio/herramienta.js';
import { fichaParaElModelo } from './contrato-modelo.js';
import { definirHerramienta } from './definir-herramienta.js';

const esquema = z.object({
  query: z.string().min(1).describe('Palabras del producto que busca el cliente, p. ej. "anillo oro".'),
});

/**
 * `buscar_producto` (AGT8): envuelve `BuscarProductos` de `catalogo` sin recalcular nada. Devuelve
 * hasta 5 productos `{id, nombre, descripcion_corta}` y nunca SKU (AGT16). Coincidencia clara = la búsqueda
 * devuelve un único producto: ese resultado trae además en `ficha` exactamente lo que devolvería `obtener_ficha`
 * (mismo caso de uso y mismo formateo, con el precio ya formateado por el backend, R1/R2), así el modelo se ahorra
 * una vuelta. Con varios resultados no hay ficha ni dinero. Si la ficha no se puede leer, el resultado sale sin ella.
 */
export function crearBuscarProducto(buscar: BuscarProductos, ficha: ObtenerFichaProducto): Herramienta {
  return definirHerramienta(
    'buscar_producto',
    'Busca productos del catálogo por palabras clave. Devuelve hasta 5 con id, nombre y descripción corta. ' +
      'Si encuentra un solo producto, ese resultado incluye su ficha completa en `ficha` (la misma de obtener_ficha, ' +
      'con el precio ya formateado): en ese caso no llames obtener_ficha para ese producto.',
    esquema,
    async ({ query }) => {
      const productos = await buscar.ejecutar(query);
      const resultados: Record<string, unknown>[] = productos.map((producto) => ({
        id: producto.id,
        nombre: producto.nombre,
        descripcion_corta: producto.descripcionCorta,
      }));
      const [unico] = productos;
      if (productos.length === 1 && unico !== undefined) {
        const fichaUnica = await ficha.ejecutar(unico.id).then(fichaParaElModelo, () => null);
        if (fichaUnica !== null) {
          resultados[0] = { ...resultados[0], ficha: fichaUnica };
        }
      }
      return { paraElModelo: resultados, efectos: [] };
    },
    // Solo lee: puede correr junto a las otras concurrentes del paso.
    { concurrente: true },
  );
}
