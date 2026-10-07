/**
 * Superficie pública de `modulos/agente` (ADR-0016). `AppModule` importa `AgenteModule` para componer
 * `ConversacionesModule.conGenerador(AgenteModule)`; el resto del agente es interno salvo el estilo editable.
 */
export { AgenteModule } from './agente.module.js';
// Fase 08c: el estilo editable lo compone también el comando `prompt:estilo` (`scripts/`), sin el resto del agente.
export { EstiloModule } from './estilo.module.js';
export { ProveedorEstilo, type EstiloVigente } from './aplicacion/proveedor-estilo.js';
export { PublicarEstilo, type ResultadoPublicacion } from './aplicacion/publicar-estilo.js';
export { RestaurarEstilo } from './aplicacion/restaurar-estilo.js';
export { SembrarEstilo, type ResultadoSembrarEstilo } from './aplicacion/sembrar-estilo.js';
export { ListarHistorialEstilo, type EstiloConHistorial } from './aplicacion/listar-historial-estilo.js';
export {
  AdministrarSeccionesEstilo,
  type EntradaSeccionEstilo,
} from './aplicacion/administrar-secciones-estilo.js';
export type {
  ResultadoCambioSecciones,
  SeccionEstilo,
} from './puertos/repositorio-secciones-estilo.js';
