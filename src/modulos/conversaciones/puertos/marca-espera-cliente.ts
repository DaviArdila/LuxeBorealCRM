/** Token de inyección del puerto {@link MarcaEsperaCliente} (D4 de la Fase 08d). */
export const MARCA_ESPERA_CLIENTE = Symbol('MARCA_ESPERA_CLIENTE');

/** Un cliente que escribió bajo control humano y aún no recibe respuesta: solo el id y el instante (R14). */
export interface EsperaCliente {
  readonly conversacionId: string;
  /** Instante del **primer** mensaje sin respuesta de esta espera. */
  readonly desde: Date;
}

/**
 * Puerto de la marca de «cliente esperando» (CNV12, D4 de la Fase 08d). Nunca guarda el contenido de un mensaje
 * (R14): solo el id de la conversación y el instante. Una espera pasa por tres momentos: **pendiente** (se abrió),
 * **avisada** (ya se avisó al asesor; no se reabre ni se repite) y cerrada (se borra todo).
 */
export interface MarcaEsperaCliente {
  /** Abre la espera si no hay una pendiente ni avisada; un mensaje posterior nunca cambia el instante. */
  registrar(conversacionId: string, ahora: Date): Promise<void>;
  /** Borra la espera, pendiente o avisada: un asesor respondió, la conversación volvió a `bot` o se resolvió. */
  cerrar(conversacionId: string): Promise<void>;
  /** Esperas pendientes cuyo primer mensaje es anterior o igual a `limite`, de la más antigua a la más reciente. */
  vencidas(limite: Date, maximo: number): Promise<readonly EsperaCliente[]>;
  /**
   * Reclama el aviso de una espera, de forma atómica: `true` solo para quien la pasa de pendiente a avisada.
   * Dos barridos concurrentes nunca avisan dos veces.
   */
  reclamarAviso(conversacionId: string): Promise<boolean>;
  /** Deshace {@link reclamarAviso} si el aviso no se pudo encolar: la espera vuelve a pendiente, con su instante. */
  devolverAviso(espera: EsperaCliente): Promise<void>;
}
