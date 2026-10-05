import type { Usuario, UsuarioNuevo } from '../dominio/usuario.js';

export const REPOSITORIO_USUARIO = Symbol('REPOSITORIO_USUARIO');

export type ResultadoCrearUsuario =
  | { readonly creado: true; readonly usuario: Usuario }
  | { readonly creado: false; readonly motivo: 'correo-repetido' };

/** Acceso a la tabla `usuario` (design.md «Puertos y adaptadores»). */
export interface RepositorioUsuario {
  /** Compara sin distinguir mayúsculas (USR1). */
  buscarPorEmail(email: string): Promise<Usuario | null>;
  buscarPorId(id: string): Promise<Usuario | null>;
  /** Escribe `ultimo_acceso` con el instante del `Clock` de quien llama (USR1). */
  registrarAcceso(id: string, instante: Date): Promise<void>;
  /** Un correo que ya existe no modifica al usuario existente (USR10). */
  crear(nuevo: UsuarioNuevo): Promise<ResultadoCrearUsuario>;
}
