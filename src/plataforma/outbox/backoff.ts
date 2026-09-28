/**
 * Retraso antes de reintentar un efecto del outbox, en segundos (D12 de
 * `openspec/changes/fase-04-canal-chatwoot/design.md`): `min(base·2^(intentos−1), max)`. Con los
 * valores por defecto (`OUTBOX_BACKOFF_BASE_S = 15`, `OUTBOX_BACKOFF_MAX_S = 300`): 15, 30, 60,
 * 120 s tras el 1.º-4.º fallo; si el 5.º fallo también es transitorio, `PublicadorOutbox` (no esta
 * función) decide agotar `OUTBOX_MAX_INTENTOS` y marcar la fila muerta. Sin *jitter* (Q1 de la
 * proposal): un solo proceso publicador y orden estricto por grupo — el no-determinismo solo
 * complicaría los tests.
 */
export function retrasoSegundos(intentos: number, baseS: number, maxS: number): number {
  return Math.min(baseS * 2 ** (intentos - 1), maxS);
}
