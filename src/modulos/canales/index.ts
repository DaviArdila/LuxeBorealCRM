/**
 * Superficie pública de `modulos/canales` (design.md, tabla "Módulos y dependencias"). Nadie fuera
 * de este módulo importa rutas internas (`./dominio/...`, `./aplicacion/...`, `./puertos/...`,
 * `./infraestructura/...`, `./interfaz/...`) — regla de fronteras `sin-rutas-internas-de-modulo`.
 * `SALIDA_CANAL` (D9) se exporta cuando exista (T5). `CONSUMIDOR_EVENTOS_CANAL` y
 * `RegistroConsumidorEventosCanal` (D8, T4) sí se exportan desde ahora: la Fase 05 los necesita
 * para que `conversaciones` registre su propio consumidor desde `onModuleInit`, sin importar una
 * ruta interna de este módulo.
 */
export { CanalesModule } from './canales.module.js';
export { RegistroConsumidorEventosCanal } from './aplicacion/registro-consumidor-eventos-canal.js';
export {
  CONSUMIDOR_EVENTOS_CANAL,
  type ConsumidorEventosCanal,
} from './puertos/consumidor-eventos-canal.js';
