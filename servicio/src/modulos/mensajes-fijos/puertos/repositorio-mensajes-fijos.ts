/** Token de inyección del puerto {@link RepositorioMensajesFijos}. */
export const REPOSITORIO_MENSAJES_FIJOS = Symbol('REPOSITORIO_MENSAJES_FIJOS');

/** Token de la lista cerrada de mensajes fijos (CFN1): `readonly DefinicionMensajeFijo[]`. */
export const CATALOGO_MENSAJES_FIJOS = Symbol('CATALOGO_MENSAJES_FIJOS');

/** Una fila de `parametro`: el valor tal como está guardado (puede no ser texto) y cuándo se escribió. */
export interface FilaMensajeFijo {
  readonly valor: unknown;
  readonly actualizado: Date;
}

/**
 * Acceso a las filas de `parametro` de los mensajes fijos (D3 de la Fase 11b). Solo lee y escribe las claves que se le
 * piden: la lista cerrada de CFN1 la impone quien lo llama, así esta vía nunca se vuelve un editor genérico de parámetros.
 */
export interface RepositorioMensajesFijos {
  /** Solo las claves pedidas que tienen fila. */
  leer(claves: readonly string[]): Promise<ReadonlyMap<string, FilaMensajeFijo>>;
  /** Crea o reemplaza el texto y escribe `actualizado` con `ahora` (el reloj de quien llama, PLT2). */
  guardar(clave: string, texto: string, ahora: Date): Promise<void>;
  /** Inserta las que no tienen fila y devuelve cuántas insertó; nunca modifica una fila existente (CFN3). */
  insertarFaltantes(mensajes: readonly { clave: string; texto: string }[], ahora: Date): Promise<number>;
}
