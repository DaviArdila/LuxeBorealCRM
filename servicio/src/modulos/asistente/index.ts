/**
 * Superficie pública de `modulos/asistente` (Fase 12, ADR-0024). Nadie fuera de este módulo importa rutas internas (regla
 * de fronteras `sin-rutas-internas-de-modulo`): los demás módulos piden sus textos por `TEXTOS_ASISTENTE` y las claves de
 * `ClaveSistema`; `scripts/sembrar-casos.ts` usa `SembrarCasos`.
 */
export { AsistenteModule } from './asistente.module.js';
export { SembrarCasos, type ResultadoSemilla } from './aplicacion/sembrar-casos.js';
export { AdministrarTextosDelSistema } from './aplicacion/administrar-textos-del-sistema.js';
export { TEXTOS_ASISTENTE, type TextosAsistente } from './puertos/textos-asistente.js';
export type { CasoDelSistema } from './puertos/repositorio-casos.js';
export {
  CASOS_DEL_SISTEMA,
  esClaveDelSistema,
  textoDeRespaldo,
  type ClaveSistema,
  type DefinicionCasoSistema,
} from './dominio/sistema.js';
