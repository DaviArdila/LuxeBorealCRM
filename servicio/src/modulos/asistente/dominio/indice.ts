/** Topes del índice (CAS8): constantes de código, como el resto de topes del asistente; el prompt de cada turno lo lleva entero. */
export const MAX_CASOS_INDICE = 60;
export const MAX_CARACTERES_INDICE = 6000;

/** Un caso de intención en el índice: lo que el LLM ve para decidir si lo consulta. */
export interface EntradaIndice {
  readonly titulo: string;
  readonly cuandoAplica: string;
}

export interface IndiceCasos {
  readonly entradas: readonly EntradaIndice[];
  /** `true` si había más casos de los que caben (por cantidad o por caracteres). */
  readonly recortado: boolean;
  /** Cuántos casos de intención activos había antes de recortar. */
  readonly total: number;
}

/** La línea con la que un caso entra al prompt (también la que se cuenta contra el tope de caracteres). */
export function lineaDeIndice(entrada: EntradaIndice): string {
  return `- ${entrada.titulo}: ${entrada.cuandoAplica}`;
}

/**
 * Arma el índice (CAS8) con los casos ya ordenados por categoría y título: toma los primeros que caben en 60 casos y 6.000
 * caracteres (cada línea más un salto). Recortar es por orden, nunca al azar, y quien llama avisa en el log solo con conteos.
 */
export function construirIndice(casos: readonly EntradaIndice[]): IndiceCasos {
  const entradas: EntradaIndice[] = [];
  let caracteres = 0;
  for (const caso of casos) {
    const costo = lineaDeIndice(caso).length + 1;
    if (entradas.length >= MAX_CASOS_INDICE || caracteres + costo > MAX_CARACTERES_INDICE) break;
    entradas.push(caso);
    caracteres += costo;
  }
  return { entradas, recortado: entradas.length < casos.length, total: casos.length };
}
