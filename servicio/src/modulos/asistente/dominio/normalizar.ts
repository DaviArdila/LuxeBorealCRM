import { normalizarTexto } from '../../../compartido/texto/index.js';

/** Nombre de categoría o título de caso en minúsculas y sin acentos: la clave de unicidad y de búsqueda (CAS1, CAS10). */
export function normalizarNombre(nombre: string): string {
  return normalizarTexto(nombre);
}

/**
 * Lo que busca `q` (CAS10): título, «cuándo aplica» y texto juntos, normalizados. Se calcula al escribir para que la
 * búsqueda no dependa de la extensión `unaccent` de Postgres (D4).
 */
export function textoDeBusqueda(caso: { titulo: string; cuandoAplica: string; texto: string }): string {
  return normalizarTexto(`${caso.titulo} ${caso.cuandoAplica} ${caso.texto}`);
}
