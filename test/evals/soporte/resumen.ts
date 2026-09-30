import type { ResultadoAsercion } from './aserciones.js';
import type { Veredicto } from './umbral.js';

export interface CasoResumen {
  readonly id: string;
  readonly titulo: string;
  readonly resultados: readonly ResultadoAsercion[];
}

export interface ExtrasReal {
  readonly costoUsd: number;
  readonly modelosPorCaso: Readonly<Record<string, readonly string[]>>;
}

/**
 * Resumen impreso de una corrida (EVL1, EVL4): casos ordenados por `id`, una línea por aserción fallida
 * y el veredicto. Sin tiempos ni texto de clientes (R14), así dos corridas guionadas dan el mismo texto.
 * El modo real agrega el costo sumado de `uso_llm` y el modelo que respondió cada caso.
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
    lineas.push(`${caso.id} — ${caso.titulo}: ${String(pasan)}/${String(caso.resultados.length)} aserciones`);
    for (const fallo of caso.resultados.filter((r) => !r.ok)) {
      lineas.push(`  ✗ ${fallo.nombre}${fallo.critica ? ' (crítica)' : ''}: ${fallo.detalle}`);
    }
    const modelos = extras?.modelosPorCaso[caso.id];
    if (modelos !== undefined && modelos.length > 0) {
      lineas.push(`  modelos: ${modelos.join(', ')}`);
    }
  }
  lineas.push(
    `Veredicto: ${veredicto.aprobada ? 'APROBADA' : 'REPROBADA'} — críticas fallidas: ${String(veredicto.criticasFallidas)}, ` +
      `no críticas que pasan: ${(veredicto.porcentajeNoCriticas * 100).toFixed(1)} %`,
  );
  if (extras !== undefined) {
    lineas.push(`Costo estimado: ${extras.costoUsd.toFixed(4)} USD`);
  }
  return lineas.join('\n');
}
