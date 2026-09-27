import type { EventoCanal } from '../dominio/evento-canal.js';

/** Token de inyección del puerto {@link ConsumidorEventosCanal} (D8 de `design.md`). */
export const CONSUMIDOR_EVENTOS_CANAL = Symbol('CONSUMIDOR_EVENTOS_CANAL');

/**
 * Puerto de consumo de un evento ya traducido y registrado (design.md, "Puertos y adaptadores";
 * D8). MUST ser idempotente: la entrega es al menos una vez (ADR-0004, D7) — el mismo evento puede
 * llegar dos veces si el proceso cae entre el éxito del consumidor y el `UPDATE procesado_en`.
 */
export interface ConsumidorEventosCanal {
  consumir(evento: EventoCanal): Promise<void>;
}
