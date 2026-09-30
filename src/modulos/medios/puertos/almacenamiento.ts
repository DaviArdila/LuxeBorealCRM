/** Token de inyección del puerto {@link Almacenamiento} (design.md D3, "Interfaces / Contracts"). */
export const ALMACENAMIENTO = Symbol('ALMACENAMIENTO');

/**
 * Error tipado de `leer` sobre una clave sin objeto (MED10). Lleva la clave —que no es dato
 * personal— y nunca el detalle del proveedor.
 */
export class ObjetoNoEncontrado extends Error {
  constructor(readonly clave: string) {
    super(`Objeto no encontrado: ${clave}`);
    this.name = 'ObjetoNoEncontrado';
  }
}

/** Contenido de un objeto leído (MED10): los bytes y el tipo con el que se guardó. */
export interface ObjetoAlmacenado {
  readonly contenido: Buffer;
  readonly contentType: string;
}

/**
 * Puerto de almacenamiento de objetos (D3, MED1, MED10). Las operaciones trabajan sobre una **clave
 * de objeto**, nunca sobre una ruta de filesystem (ADR-0012 corrige A14 del prototipo, que guardaba
 * las fotos en disco local): `foto.clave_archivo` y `producto.clave_collage` son claves de objeto
 * válidas sin importar en qué máquina corrió el importador.
 */
export interface Almacenamiento {
  /** Sube `contenido` bajo `clave`, sobrescribiendo cualquier objeto previo con esa misma clave. */
  guardar(clave: string, contenido: Buffer, contentType: string): Promise<void>;
  /** URL desde la que se puede obtener el objeto ya guardado bajo `clave`. */
  obtenerUrl(clave: string): Promise<string>;
  /**
   * Lee el objeto guardado bajo `clave` (MED10). Quien lo necesita (el canal de salida, D5 de la
   * 07b) sube el archivo a otro sistema sin depender de una URL pública. Falla con
   * {@link ObjetoNoEncontrado} si la clave no existe.
   */
  leer(clave: string): Promise<ObjetoAlmacenado>;
  /** Borra el objeto guardado bajo `clave`; no falla si la clave ya no existe. */
  eliminar(clave: string): Promise<void>;
}
