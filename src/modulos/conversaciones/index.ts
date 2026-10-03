/**
 * Superficie pública de `modulos/conversaciones` (D15 de `design.md`). Nadie fuera de este módulo
 * importa rutas internas — regla de fronteras `sin-rutas-internas-de-modulo`. `AppModule` importa
 * `ConversacionesModule`; el módulo `agente` (Fase 07a, ADR-0016) importa `GENERADOR_RESPUESTA` y los
 * tipos del contrato del turno para implementar el puerto sin que `conversaciones` lo conozca.
 */
export {
  RegistroObservadoresHandoff,
  type EventoHandoff,
  type ObservadorHandoff,
} from './aplicacion/registro-observadores-handoff.js';
export { ObservadoresHandoffModule } from './observadores-handoff.module.js';
export { ConversacionesModule } from './conversaciones.module.js';
export {
  ObtenerReferenciaConversacion,
  type ReferenciaConversacion,
} from './aplicacion/obtener-referencia-conversacion.js';
export { ReferenciaConversacionModule } from './referencia-conversacion.module.js';
export {
  GENERADOR_RESPUESTA,
  type CapacidadesSalida,
  type ContextoTurno,
  type GeneradorRespuesta,
  type MensajeTurno,
  type MotivoHandoff,
  type RespuestaTurno,
  type SolicitudTurno,
  type TipoContenidoTurno,
} from './puertos/generador-respuesta.js';
export type { CanalConversacion } from './puertos/repositorio-conversacion.js';
export type { PasoImagen, PasoRespuesta, PasoTexto } from './puertos/salida-conversacion.js';
