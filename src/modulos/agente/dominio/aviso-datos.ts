import type { PasoRespuesta } from '../../conversaciones/index.js';

/**
 * Antepone el aviso de asistente automatizado (AGT2, R14) al primer paso de texto de la respuesta,
 * separado por un párrafo, para que viaje en el mismo mensaje y no cueste un saliente más (R13).
 * Sin aviso configurado o sin ningún paso de texto devuelve los pasos tal cual: nunca crea un
 * mensaje solo para el aviso.
 */
export function anteponerAviso(pasos: readonly PasoRespuesta[], aviso: string): readonly PasoRespuesta[] {
  const indice = pasos.findIndex((paso) => paso.tipo === 'texto');
  if (indice === -1 || aviso.trim() === '') {
    return pasos;
  }
  return pasos.map((paso, i) => (i === indice ? { ...paso, texto: `${aviso}\n\n${paso.texto}` } : paso));
}
