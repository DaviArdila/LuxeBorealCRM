/** Token de inyección del puerto {@link Notificador}. */
export const NOTIFICADOR = Symbol('NOTIFICADOR');

/**
 * Fallo esperado al entregar un aviso (D9 de la Fase 08, NTF4): `transitorio` se reintenta por el outbox
 * (429, 5xx, red) y `permanente` no (400, 401, 403). `causa` MUST NOT llevar el cuerpo de la respuesta,
 * la URL ni el token (R14): solo la operación y el estado.
 */
export class FalloNotificacion extends Error {
  constructor(
    readonly naturaleza: 'transitorio' | 'permanente',
    readonly causa: string,
    readonly esperaSugeridaS?: number,
  ) {
    super(causa);
    this.name = 'FalloNotificacion';
  }
}

/** Puerto de salida hacia los asesores (NTF1): hoy Telegram, mañana cualquier otro canal interno. */
export interface Notificador {
  /** Entrega un texto plano al grupo de asesores; lanza {@link FalloNotificacion} si no pudo. */
  enviar(texto: string): Promise<void>;
}
