/**
 * Superficie pública de `modulos/usuarios` (Fase 11a). Nadie fuera de este módulo importa rutas internas (regla de
 * fronteras `sin-rutas-internas-de-modulo`): los demás módulos usan los decoradores para abrir o restringir sus rutas, y
 * `scripts/usuario-crear.ts` usa `CrearUsuario` con su propio `LectorContrasena` de consola.
 */
export { UsuariosModule } from './usuarios.module.js';
export { Publico, Roles, SinCsrf, UsuarioActual } from './interfaz/decoradores.js';
export { DocumentarRutaDeAdmin } from './interfaz/documentacion.js';
export { ObtenerSesionActual } from './aplicacion/obtener-sesion-actual.js';
export {
  CrearUsuario,
  type DatosUsuarioNuevo,
  type MotivoUsuarioNoCreado,
  type ResultadoCrearUsuarioCli,
} from './aplicacion/crear-usuario.js';
export type { LectorContrasena } from './puertos/lector-contrasena.js';
export type { PerfilUsuario, Rol } from './dominio/usuario.js';
