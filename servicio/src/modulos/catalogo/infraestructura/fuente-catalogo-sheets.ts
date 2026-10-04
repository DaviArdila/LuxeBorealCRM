import type { FilaCruda, NombrePestana } from '../dominio/validar-catalogo.js';
import { PestanaNoDisponible, type FuenteCatalogo } from '../puertos/fuente-catalogo.js';
import { parsearCsv } from './csv.js';

/** Endpoint público de Google Sheets (D2); overridable en tests contra un servidor HTTP local. */
const URL_BASE_SHEETS_POR_DEFECTO = 'https://docs.google.com/spreadsheets';

/**
 * Prefijos de cuerpo que delatan una respuesta HTML (hoja no compartida, o la pantalla de inicio
 * de sesión de Google) en vez del CSV esperado (IMP2), sin depender únicamente de `content-type`.
 */
const PREFIJOS_HTML = ['<!doctype', '<html'];

/**
 * Adaptador de {@link FuenteCatalogo} sobre el endpoint público `gviz/tq?tqx=out:csv` de Google
 * Sheets (D2, IMP1): descarga cada pestaña por su nombre. Detecta HTML antes de intentar parsear
 * como CSV (IMP2, motivo `'no_compartida'`); una respuesta que no es HTML pero tampoco `ok` (la
 * pestaña no existe en la hoja) es el mismo caso de "pestaña inexistente" que un directorio local
 * sin ese archivo (IMP2, motivo `'inexistente'`).
 */
export class FuenteCatalogoSheets implements FuenteCatalogo {
  constructor(
    private readonly sheetId: string,
    private readonly urlBase: string = URL_BASE_SHEETS_POR_DEFECTO,
  ) {}

  async leerPestana(nombre: NombrePestana): Promise<readonly FilaCruda[]> {
    const url = `${this.urlBase}/d/${this.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(nombre)}`;
    const respuesta = await fetch(url);
    const contentType = respuesta.headers.get('content-type') ?? '';
    const cuerpo = await respuesta.text();

    if (esRespuestaHtml(contentType, cuerpo)) {
      throw new PestanaNoDisponible(nombre, 'no_compartida');
    }
    if (!respuesta.ok) {
      throw new PestanaNoDisponible(nombre, 'inexistente');
    }
    return parsearCsv(cuerpo);
  }
}

function esRespuestaHtml(contentType: string, cuerpo: string): boolean {
  if (contentType.includes('text/html')) return true;
  const inicio = cuerpo.trimStart().slice(0, 15).toLowerCase();
  return PREFIJOS_HTML.some((prefijo) => inicio.startsWith(prefijo));
}
