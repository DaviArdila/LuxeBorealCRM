/**
 * Superficie pública de `modulos/agente` (ADR-0016). Solo `AppModule` la importa, para componer
 * `ConversacionesModule.conGenerador(AgenteModule)`; el resto del agente es interno.
 */
export { AgenteModule } from './agente.module.js';
