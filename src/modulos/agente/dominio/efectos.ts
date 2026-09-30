/**
 * Efectos de un turno (D1 de la Fase 07b): unión cerrada de lo que una herramienta deja dicho sobre
 * el mundo además de su resultado para el modelo. El bucle los acumula sin interpretarlos (A4) y
 * `ContenidoLlm` los aplica al final del turno; así se prueban sin LLM.
 */
export type EfectoTurno =
  | { readonly tipo: 'enviar-imagen'; readonly claveObjeto: string; readonly leyenda?: string }
  | { readonly tipo: 'sin-cobertura' }
  | { readonly tipo: 'datos-contacto-guardados' }
  | { readonly tipo: 'lead-propuesto'; readonly temperatura: 'tibio' | 'caliente' };
