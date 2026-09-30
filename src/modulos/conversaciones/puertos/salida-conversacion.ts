/** Un paso de texto de la respuesta generada, listo para enviar (D9/D10 de `design.md`). */
export interface PasoTexto {
  readonly paso: string;
  readonly tipo: 'texto';
  readonly texto: string;
}

/**
 * Un paso de imagen (CNV10, D5 de la 07b): la clave del objeto en el almacenamiento y una leyenda
 * opcional. Nunca bytes ni URLs; el canal los resuelve al publicar.
 */
export interface PasoImagen {
  readonly paso: string;
  readonly tipo: 'imagen';
  readonly claveObjeto: string;
  readonly leyenda?: string;
}

export type PasoRespuesta = PasoTexto | PasoImagen;

/** Token de inyección del puerto {@link EnviarRespuestaTurno} (D10 de `design.md`). */
export const ENVIAR_RESPUESTA_TURNO = Symbol('ENVIAR_RESPUESTA_TURNO');

/**
 * Punto único de salida del turno (**R5**, D10). Antes de encolar, relee el estado de la
 * conversación (lectura fresca, no la del inicio del turno); si no es `bot`, no envía nada. La
 * implementación real (T6) envuelve `SALIDA_CANAL` de `canales` con esa guardia; el "doble" de T4
 * solo registra las llamadas para probar `ProcesarTurno` sin adelantar T6.
 */
export interface EnviarRespuestaTurno {
  /**
   * `conHandoff`: la respuesta pide pasar a un asesor. La transición a `handoff_pendiente` ocurre
   * después de encolar y antes de publicar, así que sus pasos también se admiten en ese estado.
   */
  enviar(
    idConversacion: string,
    idRespuesta: string,
    pasos: readonly PasoRespuesta[],
    conHandoff?: boolean,
  ): Promise<void>;
}
