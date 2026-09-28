import type { PasoRespuesta } from './salida-conversacion.js';

/** Un mensaje ya resuelto del turno: texto real, obtenido por el consumidor (D16) antes de bufferear. */
export interface MensajeTurno {
  readonly idMensaje: string;
  readonly texto: string;
}

export interface RespuestaTurno {
  readonly pasos: readonly PasoRespuesta[];
}

/** Token de inyección del puerto {@link GeneradorRespuesta} (D9 de `design.md`). */
export const GENERADOR_RESPUESTA = Symbol('GENERADOR_RESPUESTA');

/**
 * Contrato mínimo del generador de respuesta (D9): esta fase lo implementa con el "agente eco"
 * (`AgenteEco`), un *stand-in* trivial. La Fase 07 reemplaza el *binding* de este token por el
 * motor real (política + LLM + herramientas, **A5**) sin tocar `ProcesarTurno`.
 */
export interface GeneradorRespuesta {
  generar(mensajes: readonly MensajeTurno[]): Promise<RespuestaTurno>;
}
