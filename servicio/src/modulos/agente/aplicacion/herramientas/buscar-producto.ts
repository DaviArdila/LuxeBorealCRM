import { z } from 'zod';
import type { BuscarProductos, ObtenerFichaProducto } from '../../../catalogo/index.js';
import type { Herramienta } from '../../dominio/herramienta.js';
import { fichaParaElModelo } from './contrato-modelo.js';
import { definirHerramienta } from './definir-herramienta.js';

const esquema = z.object({
  query: z.string().min(1).describe('Palabras del producto que busca el cliente, p. ej. "anillo oro".'),
});

/**
 * Cuántos de los primeros resultados traen su ficha (AGT8, latencia del bot): la búsqueda suele devolver de 3 a 5
 * productos y el cliente casi siempre pregunta por uno de los primeros, así el modelo no gasta otra vuelta en
 * `obtener_ficha`. Más fichas alargarían cada resultado sin ahorrar vueltas en la mayoría de los turnos.
 */
export const FICHAS_POR_BUSQUEDA = 3;

/**
 * `buscar_producto` (AGT8): envuelve `BuscarProductos` de `catalogo` sin recalcular nada. Devuelve
 * hasta 5 productos `{id, nombre, descripcion_corta}` y nunca SKU (AGT16). Los primeros
 * {@link FICHAS_POR_BUSQUEDA} traen además en `ficha` exactamente lo que devolvería `obtener_ficha` (mismo caso de uso
 * y mismo formateo, con el precio ya formateado por el backend, R1/R2), leídas en paralelo. Si la ficha de un resultado
 * no se puede leer, ese resultado sale sin ella y los demás no se afectan.
 */
export function crearBuscarProducto(buscar: BuscarProductos, ficha: ObtenerFichaProducto): Herramienta {
  return definirHerramienta(
    'buscar_producto',
    'Busca productos del catálogo por palabras clave. Devuelve hasta 5 con id, nombre y descripción corta. ' +
      `Los primeros ${String(FICHAS_POR_BUSQUEDA)} incluyen su ficha completa en \`ficha\` (la misma de obtener_ficha, ` +
      'con el precio ya formateado): no llames obtener_ficha para un resultado que ya trae su ficha. ' +
      'La lista completa del catálogo ya está en el prompt: esta herramienta no hace falta para listarlo.',
    esquema,
    async ({ query }) => {
      const productos = await buscar.ejecutar(query);
      const resultados: Record<string, unknown>[] = productos.map((producto) => ({
        id: producto.id,
        nombre: producto.nombre,
        descripcion_corta: producto.descripcionCorta,
      }));
      const fichas = await Promise.all(
        productos.slice(0, FICHAS_POR_BUSQUEDA).map((producto) => ficha.ejecutar(producto.id).then(fichaParaElModelo, () => null)),
      );
      fichas.forEach((leida, indice) => {
        if (leida !== null) resultados[indice] = { ...resultados[indice], ficha: leida };
      });
      return { paraElModelo: resultados, efectos: [] };
    },
    // Solo lee: puede correr junto a las otras concurrentes del paso.
    { concurrente: true },
  );
}
