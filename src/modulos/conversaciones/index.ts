/**
 * Superficie pública de `modulos/conversaciones` (D15 de `design.md`). Nadie fuera de este módulo
 * importa rutas internas — regla de fronteras `sin-rutas-internas-de-modulo`. Hoy solo `AppModule`
 * necesita `ConversacionesModule`; ningún otro módulo de negocio consume nada de este barril
 * todavía (la Fase 07 importará `GENERADOR_RESPUESTA`/`AgenteEco` para cambiar el *binding*).
 */
export { ConversacionesModule } from './conversaciones.module.js';
