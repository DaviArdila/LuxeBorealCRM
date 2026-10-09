/**
 * Efectos de un turno (D1 de la Fase 07b): unión cerrada de lo que una herramienta deja dicho sobre
 * el mundo además de su resultado para el modelo. El bucle los acumula sin interpretarlos (A4) y
 * `ContenidoLlm` los aplica al final del turno; así se prueban sin LLM.
 */
/**
 * Motivos con que un turno pide avisar al asesor sin traspasar (D1 de la Fase 12d). Copia de `MotivoAviso` de
 * `conversaciones`: el dominio no importa a otro módulo, y `ContenidoLlm` los iguala al traducirlos a la respuesta.
 */
export type MotivoAvisoEfecto = 'pide-persona' | 'pide-asesor' | 'lead-caliente' | 'audio-repetido';

export type EfectoTurno =
  | { readonly tipo: 'enviar-imagen'; readonly claveObjeto: string; readonly leyenda?: string }
  /** Sin cobertura de envío: solo el hecho, para que el lead no se evalúe; no lleva ningún texto (CAS12). */
  | { readonly tipo: 'sin-cobertura' }
  | { readonly tipo: 'datos-contacto-guardados' }
  | { readonly tipo: 'lead-propuesto'; readonly temperatura: 'tibio' | 'caliente' }
  /** Avisar al asesor sin traspasar (CNV13): `ContenidoLlm` lo vuelve el `aviso` de la respuesta y el bot sigue. */
  | { readonly tipo: 'avisar-asesor'; readonly motivo: MotivoAvisoEfecto };
