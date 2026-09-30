import { normalizarTexto, palabrasClave } from '../../../compartido/texto/index.js';
import type { ProductoResumen } from './producto.js';

/** Máximo de productos que devuelve una búsqueda (CAT13). */
export const MAXIMO_RESULTADOS_BUSQUEDA = 5;

/**
 * Búsqueda por palabras clave sobre un listado ya filtrado a productos activos (CAT13): cuenta cuántas
 * palabras del texto aparecen en el nombre o la descripción corta (sin tildes ni mayúsculas), descarta
 * los que no coinciden en ninguna y ordena por coincidencias, de más a menos, conservando el orden del
 * listado en los empates. Portada de `../ChatLuxeCRM/src/tools/buscarProducto.ts`, sin precio.
 */
export function buscarEnResumen(productos: readonly ProductoResumen[], texto: string): readonly ProductoResumen[] {
  const palabras = palabrasClave(texto);
  if (palabras.length === 0) {
    return [];
  }
  return productos
    .map((producto, orden) => {
      const contenido = normalizarTexto(`${producto.nombre} ${producto.descripcionCorta}`);
      return { producto, orden, coincidencias: palabras.filter((palabra) => contenido.includes(palabra)).length };
    })
    .filter((candidato) => candidato.coincidencias > 0)
    .sort((a, b) => b.coincidencias - a.coincidencias || a.orden - b.orden)
    .slice(0, MAXIMO_RESULTADOS_BUSQUEDA)
    .map((candidato) => candidato.producto);
}
