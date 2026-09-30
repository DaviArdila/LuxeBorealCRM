import type { MensajeTurno } from '../../conversaciones/index.js';

/** Marcador con que viaja una ubicación sin texto al LLM (P27, D3 de la Fase 07b). */
export const MARCADOR_UBICACION = '[ubicación compartida]';

/**
 * Texto del cliente en un turno: la unión con espacios de los textos de la ráfaga (D3). Una ráfaga
 * sin texto pero con ubicación llega al modelo como el marcador de ubicación compartida; cualquier
 * otro caso sin texto queda vacío (R12 ya respondió los demás tipos antes de llegar aquí).
 */
export function textoDelCliente(mensajes: readonly MensajeTurno[]): string {
  const textos = mensajes
    .filter((mensaje) => mensaje.tipoContenido === 'texto')
    .map((mensaje) => mensaje.texto.trim())
    .filter((texto) => texto.length > 0);
  if (textos.length > 0) {
    return textos.join(' ');
  }
  return mensajes.some((mensaje) => mensaje.tipoContenido === 'ubicacion') ? MARCADOR_UBICACION : '';
}
