/** Token de inyección del puerto {@link Almacenamiento} (design.md D3, "Interfaces / Contracts"). */
export const ALMACENAMIENTO = Symbol('ALMACENAMIENTO');

/**
 * Puerto de almacenamiento de objetos (D3, MED1). Las tres operaciones trabajan sobre una **clave
 * de objeto**, nunca sobre una ruta de filesystem (ADR-0012 corrige A14 del prototipo, que guardaba
 * las fotos en disco local): `foto.clave_archivo` y `producto.clave_collage` son claves de objeto
 * válidas sin importar en qué máquina corrió el importador.
 */
export interface Almacenamiento {
  /** Sube `contenido` bajo `clave`, sobrescribiendo cualquier objeto previo con esa misma clave. */
  guardar(clave: string, contenido: Buffer, contentType: string): Promise<void>;
  /** URL desde la que se puede obtener el objeto ya guardado bajo `clave`. */
  obtenerUrl(clave: string): Promise<string>;
  /** Borra el objeto guardado bajo `clave`; no falla si la clave ya no existe. */
  eliminar(clave: string): Promise<void>;
}
