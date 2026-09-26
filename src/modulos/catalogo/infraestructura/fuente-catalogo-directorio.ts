import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FilaCruda, NombrePestana } from '../dominio/validar-catalogo.js';
import { PestanaNoDisponible, type FuenteCatalogo } from '../puertos/fuente-catalogo.js';
import { parsearCsv } from './csv.js';

/**
 * Adaptador de {@link FuenteCatalogo} sobre un directorio local de CSVs (`--dir <fixtures>`, IMP1):
 * lee `<directorio>/<nombre>.csv` para cada una de las cinco pestañas fijas. Un archivo que no
 * existe (`ENOENT`) es el mismo caso de "pestaña inexistente" que una hoja de Sheets sin esa
 * pestaña (IMP2, motivo `'inexistente'`).
 */
export class FuenteCatalogoDirectorio implements FuenteCatalogo {
  constructor(private readonly directorio: string) {}

  async leerPestana(nombre: NombrePestana): Promise<readonly FilaCruda[]> {
    const ruta = join(this.directorio, `${nombre}.csv`);
    let contenido: string;
    try {
      contenido = await readFile(ruta, 'utf-8');
    } catch (error) {
      if (esErrorArchivoInexistente(error)) {
        throw new PestanaNoDisponible(nombre, 'inexistente');
      }
      throw error;
    }
    return parsearCsv(contenido);
  }
}

function esErrorArchivoInexistente(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
