import type { TipoContenidoTurno } from '../../conversaciones/index.js';

/** Qué hace R12 con una ráfaga, antes de mirar contadores ni textos. */
export type DecisionNoTextual =
  | { readonly accion: 'seguir'; readonly reiniciaAudios: boolean }
  | { readonly accion: 'audio' }
  | { readonly accion: 'imagen' }
  | { readonly accion: 'ignorar' };

/**
 * Tabla de R12 (D6 de la Fase 07a), decidida sobre el turno completo: si algún mensaje es texto el
 * turno sigue con ese texto y la cuenta de audios se reinicia (P28); si no, decide el tipo del
 * último. La ubicación sigue (la 07b la presenta al LLM, P27); sticker, documento y otros se ignoran.
 */
export function decidirNoTextuales(tipos: readonly TipoContenidoTurno[]): DecisionNoTextual {
  if (tipos.includes('texto')) {
    return { accion: 'seguir', reiniciaAudios: true };
  }
  switch (tipos.at(-1)) {
    case 'audio':
      return { accion: 'audio' };
    case 'imagen':
      return { accion: 'imagen' };
    case 'ubicacion':
      return { accion: 'seguir', reiniciaAudios: false };
    default:
      return { accion: 'ignorar' };
  }
}

/** `cuentaAudios` ya incluye el audio actual: el primero pide texto, el segundo consecutivo deriva. */
export function decidirAudio(cuentaAudios: number): 'pedir-texto' | 'derivar' {
  return cuentaAudios >= 2 ? 'derivar' : 'pedir-texto';
}
