/** Un paso de la respuesta generada, listo para enviar (D9/D10 de `design.md`). */
export interface PasoRespuesta {
  readonly paso: string;
  readonly texto: string;
}

/** Token de inyección del puerto {@link EnviarRespuestaTurno} (D10 de `design.md`). */
export const ENVIAR_RESPUESTA_TURNO = Symbol('ENVIAR_RESPUESTA_TURNO');

/**
 * Punto único de salida del turno (**R5**, D10). Antes de encolar, relee el estado de la
 * conversación (lectura fresca, no la del inicio del turno); si no es `bot`, no envía nada. La
 * implementación real (T6) envuelve `SALIDA_CANAL` de `canales` con esa guardia; el "doble" de T4
 * solo registra las llamadas para probar `ProcesarTurno` sin adelantar T6.
 */
export interface EnviarRespuestaTurno {
  enviar(idConversacion: string, idRespuesta: string, pasos: readonly PasoRespuesta[]): Promise<void>;
}
