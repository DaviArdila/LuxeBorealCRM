import { parse } from 'csv-parse/sync';
import type { FilaCruda } from '../dominio/validar-catalogo.js';

/**
 * Helper de parseo CSV compartido por los dos adaptadores de {@link FuenteCatalogo}
 * (`fuente-catalogo-directorio.ts`, `fuente-catalogo-sheets.ts`), D10 de
 * `openspec/changes/fase-03-importador-medios/design.md`. Usa `csv-parse/sync` (probado, con
 * soporte de campos entrecomillados y comas embebidas) en vez de un `split(',')`/`split('\n')`
 * manual — la matriz de amenazas de la fase identifica el parser manual como el vector de un CSV
 * malformado a propósito que corte una fila válida en columnas equivocadas sin ningún error visible.
 */
export function parsearCsv(contenido: string): readonly FilaCruda[] {
  return parse(contenido, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
}
