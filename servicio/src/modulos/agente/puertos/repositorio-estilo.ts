/** Token de inyección del puerto {@link RepositorioEstilo}. */
export const REPOSITORIO_ESTILO = Symbol('REPOSITORIO_ESTILO');

/** Quién publicó una versión: el usuario de la sesión (EST-D3); el comando `prompt:estilo` no tiene autor. */
export interface AutorEstilo {
  readonly id: string;
  readonly nombre: string;
}

/** El estilo publicado, su versión y quién lo publicó (AGT18, AGT21, EST-D3); sin `publicadoPor` si fue el comando. */
export interface EstiloGuardado {
  readonly texto: string;
  readonly version: number;
  readonly publicadoPor?: AutorEstilo;
}

/** Una versión retirada del estilo; `fecha` (ISO 8601) es cuando dejó de estar vigente (AGT21). */
export interface VersionHistorial {
  readonly version: number;
  readonly texto: string;
  readonly fecha: string;
  readonly publicadoPor?: AutorEstilo;
}

/** Cuántas versiones retiradas conserva el historial (AGT21, ADR-0020). */
export const MAX_VERSIONES_HISTORIAL = 10;

/**
 * Lectura y publicación del estilo editable del agente (ADR-0020; guardado en `version_estilo`, EST-D1). `leerVigente` nunca lanza por «no
 * publicado»: devuelve `null` y rige el archivo de respaldo (AGT18). `publicar` es una operación atómica que
 * guarda el texto nuevo, retira el anterior al historial y sube la versión; quien la llama valida antes (AGT20).
 */
export interface RepositorioEstilo {
  leerVigente(): Promise<EstiloGuardado | null>;
  /** Más reciente primero; vacío si no hay historial o está dañado. */
  leerHistorial(): Promise<readonly VersionHistorial[]>;
  /**
   * Devuelve la versión nueva. `fecha` es el instante de la publicación, tomado del `Clock` (PLT2); `autor` es quien
   * publica (EST-D3), ausente si fue el comando.
   */
  publicar(texto: string, fecha: Date, autor?: AutorEstilo | null): Promise<number>;
}
