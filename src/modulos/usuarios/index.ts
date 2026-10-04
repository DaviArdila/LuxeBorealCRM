/**
 * Superficie pública de `modulos/usuarios` (Fase 11a). Nadie fuera de este módulo importa rutas internas (regla de
 * fronteras `sin-rutas-internas-de-modulo`): los demás módulos usan los decoradores para abrir o restringir sus rutas.
 */
export { UsuariosModule } from './usuarios.module.js';
export { Publico, Roles, SinCsrf } from './interfaz/decoradores.js';
export { ObtenerSesionActual } from './aplicacion/obtener-sesion-actual.js';
export type { PerfilUsuario, Rol } from './dominio/usuario.js';
