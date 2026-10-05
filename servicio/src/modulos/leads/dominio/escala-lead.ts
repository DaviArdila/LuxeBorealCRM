/**
 * Escala determinista de leads (D1 de la Fase 08, R9, LDS1). Vocabulario **cerrado** de señales, cada
 * una fuerte o débil (aprobado por el usuario en P33, 2026-09-30), y una función pura que decide si un
 * conjunto de señales confirma un lead: al menos una fuerte o al menos dos débiles distintas. La escala
 * nunca lee la temperatura que propuso el LLM (esa solo se guarda).
 */
export const SENALES = {
  pide_pagar: 'fuerte',
  pide_apartar: 'fuerte',
  confirma_pedido: 'fuerte',
  da_datos_de_entrega: 'fuerte',
  pregunta_medios_de_pago: 'fuerte',
  pregunta_precio: 'debil',
  pregunta_envio: 'debil',
  pide_fotos: 'debil',
  pregunta_disponibilidad: 'debil',
  compara_productos: 'debil',
  vuelve_a_escribir: 'debil',
} as const;

export type NombreSenal = keyof typeof SENALES;

/** Los nombres del vocabulario como tupla no vacía, para construir el enum de la herramienta del LLM. */
export const NOMBRES_SENALES = Object.keys(SENALES) as [NombreSenal, ...NombreSenal[]];

/** Señales fuertes necesarias para confirmar (R9). */
export const FUERTES_PARA_CONFIRMAR = 1;
/** Señales débiles distintas necesarias para confirmar (R9). */
export const DEBILES_PARA_CONFIRMAR = 2;

export interface ResultadoEscala {
  readonly confirma: boolean;
  readonly fuertes: number;
  readonly debiles: number;
  /** Señales del vocabulario, sin repetir y en el orden en que llegaron. */
  readonly validas: readonly NombreSenal[];
}

function esSenalConocida(senal: string): senal is NombreSenal {
  return Object.hasOwn(SENALES, senal);
}

export function evaluarEscala(senales: readonly string[]): ResultadoEscala {
  const validas = [...new Set(senales.filter(esSenalConocida))];
  const fuertes = validas.filter((senal) => SENALES[senal] === 'fuerte').length;
  const debiles = validas.length - fuertes;
  return {
    confirma: fuertes >= FUERTES_PARA_CONFIRMAR || debiles >= DEBILES_PARA_CONFIRMAR,
    fuertes,
    debiles,
    validas,
  };
}
