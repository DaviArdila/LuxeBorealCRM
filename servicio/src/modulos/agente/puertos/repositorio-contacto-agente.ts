/** Datos que el cliente dio en la conversación y `guardar_datos_contacto` persiste (AGT10). */
export interface DatosCapturados {
  readonly nombre: string;
  /** `null` cuando el cliente respondió "este mismo número" o dio menos de 7 dígitos. */
  readonly telefonoAlterno: string | null;
  readonly direccion: string;
  readonly localidad: string;
}

/** Token de inyección del puerto {@link RepositorioContactoAgente}. */
export const REPOSITORIO_CONTACTO_AGENTE = Symbol('REPOSITORIO_CONTACTO_AGENTE');

/**
 * Lo poco que el agente lee y escribe del `contacto` (D6 de la Fase 07b): siempre por el id del
 * contacto de la conversación (P1), nunca por un dato que llegue del modelo. Si la Fase 08 crea un
 * módulo `contactos`, el adaptador se mueve allí sin cambiar este puerto.
 */
export interface RepositorioContactoAgente {
  /** Nombre guardado del contacto, o `null` si aún no se conoce (AGT12). */
  leerNombre(contactoId: string): Promise<string | null>;
  guardarDatosCapturados(contactoId: string, datos: DatosCapturados): Promise<void>;
}
