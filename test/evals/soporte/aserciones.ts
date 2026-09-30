import type { MotivoHandoff } from '../../../src/modulos/conversaciones/index.js';
import type { AsercionesTurno, NombreAsercion } from './esquema-caso.js';

/** Lo que el arnés observa de un turno, igual en modo guionado y real (D2). */
export interface GrabacionTurno {
  readonly llamadas: readonly { readonly nombre: string; readonly argumentos: unknown }[];
  readonly resultados: readonly { readonly nombre: string; readonly resultado: unknown; readonly esError: boolean }[];
  /** Pasos de texto de la respuesta, unidos. */
  readonly textoFinal: string;
  readonly handoff: MotivoHandoff | null;
}

export interface ResultadoAsercion {
  readonly nombre: NombreAsercion;
  readonly ok: boolean;
  readonly critica: boolean;
  /** Nunca incluye texto del cliente ni de la respuesta (R14): nombres de herramientas y conteos. */
  readonly detalle: string;
}

/** Evalúa las aserciones declaradas de un turno, en el orden fijo de `NOMBRES_ASERCION`. */
export function evaluarAserciones(grabacion: GrabacionTurno, aserciones: AsercionesTurno): readonly ResultadoAsercion[] {
  const resultados: ResultadoAsercion[] = [];
  if (aserciones.handoff !== undefined) {
    const hubo = grabacion.handoff !== null;
    const esperado = aserciones.handoff === 'esperado';
    resultados.push({
      nombre: 'handoff',
      ok: hubo === esperado,
      critica: aserciones.handoff === 'prohibido',
      detalle: hubo === esperado ? 'handoff como se esperaba' : hubo ? `handoff inesperado (${grabacion.handoff ?? ''})` : 'faltó el handoff esperado',
    });
  }
  return resultados;
}
