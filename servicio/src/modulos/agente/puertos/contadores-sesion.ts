/** Sesión bot = conversación + versión; la versión solo cambia al transicionar (D8 de la Fase 07a). */
export interface ClaveSesion {
  readonly conversacionId: string;
  readonly version: number;
}

/** Token de inyección del puerto {@link ContadoresSesion}. */
export const CONTADORES_SESION = Symbol('CONTADORES_SESION');

/**
 * Contadores efímeros de la sesión del agente (turnos respondidos, audios consecutivos y fotos individuales). Viven en
 * Redis con TTL: no son datos del negocio y perderlos solo reinicia la cuenta (D8).
 */
export interface ContadoresSesion {
  /** Turnos que el bot ya respondió en la sesión. */
  turnos(sesion: ClaveSesion): Promise<number>;
  registrarTurno(sesion: ClaveSesion): Promise<void>;
  /** Suma un audio a la sesión y devuelve la cuenta resultante (atómico). */
  sumarAudio(sesion: ClaveSesion): Promise<number>;
  /** Un mensaje de texto reinicia la cuenta de audios consecutivos (R12). */
  reiniciarAudios(sesion: ClaveSesion): Promise<void>;
  /** Fotos individuales que el bot ya envió en la sesión (tope de `enviar_fotos`, AGT9). */
  fotosIndividuales(sesion: ClaveSesion): Promise<number>;
  sumarFotosIndividuales(sesion: ClaveSesion, cantidad: number): Promise<void>;
}
