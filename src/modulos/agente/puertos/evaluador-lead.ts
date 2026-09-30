import type { ContextoHerramienta } from '../dominio/herramienta.js';

export interface PropuestaLead {
  readonly temperatura: 'tibio' | 'caliente';
  readonly senales: readonly string[];
  readonly resumen: string;
  readonly productoId: string | null;
}

/** Token de inyección del puerto {@link EvaluadorLead}. */
export const EVALUADOR_LEAD = Symbol('EVALUADOR_LEAD');

/**
 * Decide si la propuesta del LLM se convierte en un lead derivado (R9: el LLM propone, la escala
 * determinista confirma). La Fase 08 provee la implementación real; la 07 usa
 * `EvaluadorLeadSinEscala`, que nunca deriva ni escribe.
 */
export interface EvaluadorLead {
  evaluar(propuesta: PropuestaLead, ctx: ContextoHerramienta): Promise<{ derivado: boolean; motivo?: string }>;
}
