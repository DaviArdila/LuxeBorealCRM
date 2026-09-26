import type { FilaCruda, NombrePestana } from '../dominio/validar-catalogo.js';

/** Token de inyección del puerto {@link FuenteCatalogo} (design.md D2, "Puertos y adaptadores"). */
export const FUENTE_CATALOGO = Symbol('FUENTE_CATALOGO');

export type MotivoPestanaNoDisponible = 'no_compartida' | 'inexistente';

/**
 * Falla al leer una pestaña del catálogo (IMP2): `'no_compartida'` cuando el origen es una hoja de
 * Google Sheets que respondió HTML en vez de CSV; `'inexistente'` cuando la pestaña no existe (ni
 * como hoja de cálculo ni como archivo `<nombre>.csv` en un directorio local).
 */
export class PestanaNoDisponible extends Error {
  constructor(
    public readonly pestana: NombrePestana,
    public readonly motivo: MotivoPestanaNoDisponible,
  ) {
    super(
      motivo === 'no_compartida'
        ? `La pestaña "${pestana}" no se pudo leer: la hoja no está compartida como "cualquiera con el enlace: lector".`
        : `La pestaña "${pestana}" no existe en el origen del catálogo.`,
    );
    this.name = 'PestanaNoDisponible';
  }
}

/**
 * Puerto de lectura del catálogo (design.md D2, IMP1): dos adaptadores intercambiables
 * ({@link FuenteCatalogoSheets}, {@link FuenteCatalogoDirectorio}) devuelven exactamente
 * `readonly FilaCruda[]`, sin que `aplicacion/` (todavía no construida) distinga cuál se usó.
 */
export interface FuenteCatalogo {
  leerPestana(nombre: NombrePestana): Promise<readonly FilaCruda[]>;
}

export type { FilaCruda, NombrePestana };
