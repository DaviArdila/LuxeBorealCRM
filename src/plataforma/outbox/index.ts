/**
 * Superficie pública de `plataforma/outbox` (D10 de
 * `openspec/changes/fase-04-canal-chatwoot/design.md`). Nadie fuera de este módulo importa rutas
 * internas (`./tipos.js`, `./publicador-outbox.js`, etc.).
 */
export { OutboxModule } from './outbox.module.js';
export { retrasoSegundos } from './backoff.js';
export { PublicadorOutbox } from './publicador-outbox.js';
export { RegistroManejadoresOutbox } from './registro-manejadores.js';
export {
  FalloPublicacion,
  REGISTRO_OUTBOX,
  type EntradaOutbox,
  type ManejadorOutbox,
  type NuevaEntradaOutbox,
  type RegistroOutbox,
} from './tipos.js';
