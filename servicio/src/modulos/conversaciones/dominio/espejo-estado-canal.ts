import type { EstadoAtencion, OrigenTransicion } from './maquina-estados.js';

/** Estados del canal que `conversaciones` espeja; subconjunto de los que acepta `SalidaCanal`. */
export type EstadoEspejoCanal = 'abierta' | 'pendiente';

/**
 * Qué estado se refleja en el canal cuando la conversación transiciona (D3 de la 07a, mismo mapa
 * que `chatWorker.ts` del prototipo). `null` = no se espeja: el cambio vino del propio canal
 * (`chatwoot_*`) o el prototipo tampoco lo espejaba (`pausado`).
 */
export function espejoEstadoCanal(destino: EstadoAtencion, origen: OrigenTransicion): EstadoEspejoCanal | null {
  if (destino === 'handoff_pendiente' || destino === 'humano') return 'abierta';
  if (destino === 'bot' && (origen === 'ttl' || origen === 'admin')) return 'pendiente';
  return null;
}
