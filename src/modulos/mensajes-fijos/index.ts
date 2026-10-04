/**
 * Superficie pública de `modulos/mensajes-fijos` (Fase 11b). Nadie fuera de este módulo importa rutas internas (regla de
 * fronteras `sin-rutas-internas-de-modulo`): `scripts/sembrar-mensajes-fijos.ts` usa `SembrarMensajesFijos`.
 */
export { MensajesFijosModule } from './mensajes-fijos.module.js';
export { ListarMensajesFijos } from './aplicacion/listar-mensajes-fijos.js';
export { GuardarMensajeFijo, type ResultadoGuardarMensajeFijo } from './aplicacion/guardar-mensaje-fijo.js';
export { SembrarMensajesFijos, type ResultadoSemilla } from './aplicacion/sembrar-mensajes-fijos.js';
export type { MensajeFijo, OrigenMensajeFijo } from './dominio/mensaje-fijo.js';
