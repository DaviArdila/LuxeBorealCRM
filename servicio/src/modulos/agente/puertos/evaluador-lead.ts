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
 * Lo que decidió la escala (Fase 08): `derivar` (dentro de horario, el turno termina en handoff),
 * `capturar` (fuera de horario, el bot pide los datos y sigue atendiendo, LDS4) o `ninguna`.
 */
export interface ResultadoEvaluacionLead {
  readonly derivado: boolean;
  readonly accion: 'derivar' | 'capturar' | 'ninguna';
  readonly leadId: string | null;
  readonly motivo?: string;
}

/**
 * Decide si la propuesta del LLM se convierte en un lead derivado (R9: el LLM propone, la escala
 * determinista confirma). La implementación real es `EvaluadorLeadDeLeads`, que delega en el módulo
 * `leads`; la Fase 07 usaba un evaluador que nunca derivaba.
 */
export interface EvaluadorLead {
  evaluar(propuesta: PropuestaLead, ctx: ContextoHerramienta): Promise<ResultadoEvaluacionLead>;
}
