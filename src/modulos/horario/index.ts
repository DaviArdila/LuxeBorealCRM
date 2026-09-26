/**
 * Superficie pública de `modulos/horario` (design.md, tabla "Módulos tocados y dependencias").
 * Nadie fuera de este módulo importa rutas internas (`./dominio/horario.js`,
 * `./aplicacion/horario-atencion.js`, etc.) — regla de fronteras `sin-rutas-internas-de-modulo`. Se
 * exporta el token `HORARIO` y su tipo de puerto para que un módulo futuro (07/08) pueda inyectarlo
 * sin conocer que la implementación real es `HorarioAtencion`.
 */
export { HorarioModule } from './horario.module.js';
export { HORARIO, type Horario } from './puertos/horario.js';
