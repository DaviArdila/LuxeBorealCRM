import type { ClaveSesion } from './contadores-sesion.js';

/** Un turno ya cerrado de la sesión: quién habló y su texto final (nunca resultados de herramientas). */
export interface TurnoHistorial {
  readonly rol: 'usuario' | 'asistente';
  readonly texto: string;
}

/** Token de inyección del puerto {@link HistorialConversacion}. */
export const HISTORIAL_CONVERSACION = Symbol('HISTORIAL_CONVERSACION');

/**
 * Historial corto de la sesión del agente (D3 de la Fase 07b, ADR-0017). Chatwoot sigue siendo la
 * fuente de los mensajes (P3): esto es solo la memoria de trabajo del LLM, efímera y por sesión
 * (conversación + versión), que se reinicia sola cuando la conversación vuelve del asesor.
 */
export interface HistorialConversacion {
  /** Los últimos `turnos` turnos (un turno = mensaje del cliente + respuesta del bot), en orden cronológico. */
  leer(sesion: ClaveSesion, turnos: number): Promise<readonly TurnoHistorial[]>;
  /** Solo se llama con turnos que terminaron con texto final del LLM (AGT7). */
  agregar(sesion: ClaveSesion, textoCliente: string, textoBot: string): Promise<void>;
}
