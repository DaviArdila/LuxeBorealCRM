/**
 * Superficie pública de `modulos/canales` (design.md, tabla "Módulos y dependencias"). Nadie fuera
 * de este módulo importa rutas internas (`./dominio/...`, `./aplicacion/...`, `./puertos/...`,
 * `./infraestructura/...`, `./interfaz/...`) — regla de fronteras `sin-rutas-internas-de-modulo`.
 * `CONSUMIDOR_EVENTOS_CANAL` y `RegistroConsumidorEventosCanal` (D8, T4) se exportan desde ahora:
 * la Fase 05 los necesita para que `conversaciones` registre su propio consumidor desde
 * `onModuleInit`, sin importar una ruta interna de este módulo. `SALIDA_CANAL` (D9, T7) se exporta
 * igual: la Fase 05 lo consume desde `conversaciones/salida`, que le agrega la relectura del
 * estado de la FSM antes de cada envío; hasta entonces el único consumidor es el test.
 * `ADAPTADOR_CANAL` (interno, D9) nunca se exporta: solo lo invoca `PublicarEfectoCanal`.
 * `LECTOR_MENSAJE_CANAL` (D16 de la Fase 05, agregado en `sdd-apply`) se exporta igual: el
 * consumidor de `conversaciones` lo usa para resolver el texto real de un mensaje entrante antes
 * de empujarlo al buffer del turno (`EventoCanal` nunca trae texto, R14/CAN5).
 */
export { CanalesModule } from './canales.module.js';
export { RegistroConsumidorEventosCanal } from './aplicacion/registro-consumidor-eventos-canal.js';
export {
  CONSUMIDOR_EVENTOS_CANAL,
  type ConsumidorEventosCanal,
} from './puertos/consumidor-eventos-canal.js';
export type { EventoCanal } from './dominio/evento-canal.js';
export { perfilDeCapacidades, type PerfilCapacidades } from './dominio/perfil-capacidades.js';
export { LECTOR_MENSAJE_CANAL, type LectorMensajeCanal } from './puertos/lector-mensaje-canal.js';
export {
  SALIDA_CANAL,
  type MensajeSaliente,
  type SalidaCanal,
  type SolicitudCambioEstado,
  type SolicitudEnvioMensajes,
  type SolicitudEtiquetas,
} from './puertos/salida-canal.js';
