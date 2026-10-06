import type { ClaveSistema } from '../dominio/sistema.js';

/** Token de inyección del puerto {@link TextosAsistente}. */
export const TEXTOS_ASISTENTE = Symbol('TEXTOS_ASISTENTE');

/**
 * El único puerto con el que los demás módulos piden un texto que el bot le dice al cliente (CAS7, D3 de la Fase 12).
 * Nunca lanza: devuelve el texto del caso guardado y, si no existe o está vacío, el de respaldo del código; el turno
 * sigue siempre.
 */
export interface TextosAsistente {
  textoDelSistema(clave: ClaveSistema): Promise<string>;
}
