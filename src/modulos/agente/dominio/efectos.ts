/**
 * Efectos de un turno (D1 de la Fase 07b): unión cerrada de lo que una herramienta deja dicho sobre
 * el mundo además de su resultado para el modelo. El bucle los acumula sin interpretarlos (A4) y
 * `ContenidoLlm` los aplica al final del turno; así se prueban sin LLM.
 */
export type EfectoTurno =
  | { readonly tipo: 'enviar-imagen'; readonly claveObjeto: string; readonly leyenda?: string }
  /** Sin cobertura de envío; lleva el mensaje del negocio, que debe llegar literal al cliente (R2). */
  | { readonly tipo: 'sin-cobertura'; readonly mensaje: string }
  | { readonly tipo: 'datos-contacto-guardados' }
  | { readonly tipo: 'lead-propuesto'; readonly temperatura: 'tibio' | 'caliente' }
  /** La escala confirmó y hay que derivar dentro de horario (D4 de la Fase 08): `ContenidoLlm` lo vuelve handoff. */
  | { readonly tipo: 'lead-derivado'; readonly leadId: string };
