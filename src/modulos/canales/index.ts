/**
 * Superficie pública de `modulos/canales` (design.md, tabla "Módulos y dependencias"). Nadie fuera
 * de este módulo importa rutas internas (`./dominio/...`, `./aplicacion/...`, `./puertos/...`,
 * `./infraestructura/...`, `./interfaz/...`) — regla de fronteras `sin-rutas-internas-de-modulo`.
 * En esta tarea (T3) solo `AppModule` necesita `CanalesModule`; los puertos que otro módulo de
 * negocio consumirá (`SALIDA_CANAL` en la Fase 05, D9) se exportan cuando existan (T5).
 */
export { CanalesModule } from './canales.module.js';
