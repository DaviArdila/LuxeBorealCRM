import type { MotivoAviso } from './generador-respuesta.js';

/** Token de inyección del puerto {@link MarcaAsesorAvisado} (D3 de la Fase 12d). */
export const MARCA_ASESOR_AVISADO = Symbol('MARCA_ASESOR_AVISADO');

/** Token de inyección del puerto de solo lectura {@link ConsultaAsesorAvisado} (CNV15). */
export const ASESOR_AVISADO = Symbol('ASESOR_AVISADO');

/** Los tres motivos que lleva la marca: pedir una persona (`pide-persona` y `pide-asesor`), lead caliente y audios. */
export type MotivoMarca = 'pide-persona' | 'lead-caliente' | 'audio-repetido';

/** `pide-persona` (política) y `pide-asesor` (herramienta) son el mismo motivo: el cliente pide una persona (CNV14). */
export function motivoDeMarca(motivo: MotivoAviso): MotivoMarca {
  return motivo === 'pide-asesor' ? 'pide-persona' : motivo;
}

/**
 * Marca «asesor avisado» por conversación y motivo (CNV14, D3 de la Fase 12d). Nunca guarda el contenido de un
 * mensaje (R14): solo el id de la conversación y el motivo.
 */
export interface MarcaAsesorAvisado {
  /** Atómica (`SET NX` sobre el par): `true` solo para quien la crea; `false` si ya estaba puesta. */
  adquirir(conversacionId: string, motivo: MotivoMarca): Promise<boolean>;
  /** Deshace {@link adquirir} cuando el aviso no se pudo encolar, para que el turno siguiente reintente. */
  liberar(conversacionId: string, motivo: MotivoMarca): Promise<void>;
  /** Borra las marcas de todos los motivos: la conversación pasó a `humano` o volvió a `bot`. */
  limpiar(conversacionId: string): Promise<void>;
  /** `true` si hay al menos una marca, de cualquier motivo. */
  estaAvisado(conversacionId: string): Promise<boolean>;
}

/**
 * Puerto de solo lectura exportado para el contexto del turno del agente (CNV15, AGT28): dice si el asesor ya fue
 * avisado por cualquier motivo sin exponer la infraestructura de Redis de `conversaciones`. Si la consulta falla
 * responde `false` y el turno continúa.
 */
export interface ConsultaAsesorAvisado {
  estaAvisado(conversacionId: string): Promise<boolean>;
}
