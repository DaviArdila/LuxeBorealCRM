import type { ResultadoAsercion } from './aserciones.js';
import type { Veredicto } from './umbral.js';

export interface CasoResumen {
  readonly id: string;
  readonly titulo: string;
  readonly resultados: readonly ResultadoAsercion[];
  /**
   * Modo real: los resultados de cada repetición por separado (`resultados` los trae unidos para el umbral). Con ellos
   * el resumen distingue una falla sistemática (en todas las repeticiones) de una ocasional.
   */
  readonly porRepeticion?: readonly (readonly ResultadoAsercion[])[];
}

export interface ExtrasReal {
  readonly costoUsd: number;
  readonly modelosPorCaso: Readonly<Record<string, readonly string[]>>;
  /** `id` de los casos `soloGuionado` que el modo real no ejecutó. */
  readonly omitidos?: readonly string[];
  /** `id` de los casos que no terminaron todas sus repeticiones (se cortaron por plazo o fallaron antes de evaluar). */
  readonly incompletos?: readonly string[];
}

function lineaDeFalla(fallo: ResultadoAsercion): string {
  return `  ✗ ${fallo.nombre}${fallo.critica ? ' (crítica)' : ''}: ${fallo.detalle}`;
}

/** Una línea por falla distinta, con en cuántas repeticiones apareció, en el orden en que aparecieron. */
function lineasPorRepeticion(porRepeticion: readonly (readonly ResultadoAsercion[])[]): string[] {
  const conteo = new Map<string, number>();
  for (const repeticion of porRepeticion) {
    for (const linea of new Set(repeticion.filter((r) => !r.ok).map(lineaDeFalla))) {
      conteo.set(linea, (conteo.get(linea) ?? 0) + 1);
    }
  }
  return [...conteo].map(([linea, veces]) => `${linea} — en ${String(veces)} de ${String(porRepeticion.length)} repeticiones`);
}

/**
 * Resumen impreso de una corrida (EVL1, EVL4): casos ordenados por `id`, una línea por aserción fallida
 * y el veredicto. Sin tiempos ni texto de clientes (R14), así dos corridas guionadas dan el mismo texto.
 * El modo real agrega el costo sumado de `uso_llm`, el modelo que respondió cada caso, en cuántas repeticiones
 * ocurrió cada falla y los casos que no terminaron.
 */
export function armarResumen(
  casos: readonly CasoResumen[],
  veredicto: Veredicto,
  modo: 'guionado' | 'real',
  extras?: ExtrasReal,
): string {
  const lineas: string[] = [`Evals del agente — modo ${modo}`];
  for (const caso of [...casos].sort((a, b) => a.id.localeCompare(b.id))) {
    const pasan = caso.resultados.filter((r) => r.ok).length;
    const limpias =
      caso.porRepeticion === undefined
        ? ''
        : `, repeticiones sin fallas: ${String(caso.porRepeticion.filter((rep) => rep.every((r) => r.ok)).length)}/${String(caso.porRepeticion.length)}`;
    lineas.push(`${caso.id} — ${caso.titulo}: ${String(pasan)}/${String(caso.resultados.length)} aserciones${limpias}`);
    lineas.push(
      ...(caso.porRepeticion === undefined
        ? caso.resultados.filter((r) => !r.ok).map(lineaDeFalla)
        : lineasPorRepeticion(caso.porRepeticion)),
    );
    const modelos = extras?.modelosPorCaso[caso.id];
    if (modelos !== undefined && modelos.length > 0) {
      lineas.push(`  modelos: ${modelos.join(', ')}`);
    }
  }
  lineas.push(
    `Veredicto: ${veredicto.aprobada ? 'APROBADA' : 'REPROBADA'} — críticas fallidas: ${String(veredicto.criticasFallidas)}, ` +
      `no críticas que pasan: ${(veredicto.porcentajeNoCriticas * 100).toFixed(1)} %`,
  );
  if (extras?.incompletos !== undefined && extras.incompletos.length > 0) {
    lineas.push(
      `Casos sin terminar: ${String(extras.incompletos.length)} (se cortaron o fallaron antes de evaluar): ` +
        [...extras.incompletos].sort().join(', '),
    );
  }
  if (extras?.omitidos !== undefined && extras.omitidos.length > 0) {
    lineas.push(
      `Casos omitidos: ${String(extras.omitidos.length)} (solo guionado: el LLM real no puede reproducir su guion): ` +
        [...extras.omitidos].sort().join(', '),
    );
  }
  if (extras !== undefined) {
    lineas.push(`Costo estimado: ${extras.costoUsd.toFixed(4)} USD`);
  }
  return lineas.join('\n');
}
