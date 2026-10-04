import type { ResultadoAsercion } from './aserciones.js';

/** EVL3: en modo real, las aserciones no críticas MUST pasar en al menos este porcentaje. */
export const UMBRAL_NO_CRITICAS_REAL = 0.9;
/** EVL3: en modo real cada caso corre este número de veces. */
export const REPETICIONES_REAL = 3;

export interface Veredicto {
  readonly aprobada: boolean;
  readonly criticasFallidas: number;
  readonly porcentajeNoCriticas: number;
}

/**
 * Umbral de aprobación por modo (D7 de la Fase 07c, EVL3), como función pura. Guionado: todo debe
 * pasar. Real: ninguna crítica puede fallar en ninguna repetición y las demás deben pasar al menos el
 * 90 %. Sin aserciones no críticas el porcentaje es 1.
 */
export function calcularVeredicto(resultados: readonly ResultadoAsercion[], modo: 'guionado' | 'real'): Veredicto {
  const criticas = resultados.filter((r) => r.critica);
  const noCriticas = resultados.filter((r) => !r.critica);
  const criticasFallidas = criticas.filter((r) => !r.ok).length;
  const noCriticasOk = noCriticas.filter((r) => r.ok).length;
  const porcentajeNoCriticas = noCriticas.length === 0 ? 1 : noCriticasOk / noCriticas.length;
  const aprobada =
    modo === 'guionado'
      ? criticasFallidas === 0 && noCriticasOk === noCriticas.length
      : criticasFallidas === 0 && porcentajeNoCriticas >= UMBRAL_NO_CRITICAS_REAL;
  return { aprobada, criticasFallidas, porcentajeNoCriticas };
}
