import type { EntradaIndice } from '../dominio/indice.js';

/** Token de inyección del puerto {@link ConsultaCasos}. */
export const CONSULTA_CASOS = Symbol('CONSULTA_CASOS');

/** El modo con el que el LLM usa el texto de un caso (CAS8): `literal` se cita palabra por palabra, `guia` es base para redactar. */
export type ModoCaso = 'literal' | 'guia';

/** Lo que `consultar_caso` entrega: el texto y el modo, o los títulos disponibles si el caso no existe o está inactivo. */
export type ResultadoCaso =
  | { readonly encontrado: true; readonly titulo: string; readonly modo: ModoCaso; readonly texto: string }
  | { readonly encontrado: false; readonly titulosDisponibles: readonly string[] };

/**
 * Lo que el agente conoce de los casos de intención (CAS8, D3 de la Fase 12): el índice del prompt y la consulta por título.
 * Nunca lanza: si la base falla el índice sale vacío y la consulta no encuentra nada, y el turno sigue.
 */
export interface ConsultaCasos {
  /** Los casos de intención activos, por orden de categoría y título, acotados a 60 casos y 6.000 caracteres. */
  indice(): Promise<readonly EntradaIndice[]>;
  /** Busca por título sin distinguir mayúsculas ni acentos entre los casos de intención activos. */
  consultar(titulo: string): Promise<ResultadoCaso>;
}
