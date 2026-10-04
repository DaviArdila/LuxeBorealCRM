/** Token de inyección del puerto {@link LectorMensajeCanal} (D16 de `design.md` de la Fase 05). */
export const LECTOR_MENSAJE_CANAL = Symbol('LECTOR_MENSAJE_CANAL');

/**
 * Puerto de solo lectura del texto de un mensaje puntual (D16, agregado durante `sdd-apply` de la
 * Fase 05): `EventoCanal` nunca trae texto (R14, CAN5), así que un consumidor que sí necesita el
 * texto real (el "agente eco" de `conversaciones`, CNV6) lo pide aquí, bajo demanda, en vez de que
 * `canales` lo persista o lo incluya en el evento normalizado.
 */
export interface LectorMensajeCanal {
  /** `null` si el mensaje ya no existe o la respuesta no se pudo interpretar; nunca lanza. */
  obtenerTexto(idConversacion: string, idMensaje: string): Promise<string | null>;
}
