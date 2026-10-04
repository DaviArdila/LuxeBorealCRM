import type { Usuario, UsuarioNuevo } from '../../src/modulos/usuarios/dominio/usuario.js';
import type {
  RepositorioUsuario,
  ResultadoCrearUsuario,
} from '../../src/modulos/usuarios/puertos/repositorio-usuario.js';

/** Doble de test de {@link RepositorioUsuario}: los usuarios y los accesos registrados, a la vista. */
export class RepositorioUsuarioEnMemoria implements RepositorioUsuario {
  readonly usuarios: Usuario[] = [];
  readonly accesos: { readonly id: string; readonly instante: Date }[] = [];

  buscarPorEmail(email: string): Promise<Usuario | null> {
    const buscado = email.trim().toLowerCase();
    return Promise.resolve(this.usuarios.find((usuario) => usuario.email.toLowerCase() === buscado) ?? null);
  }

  buscarPorId(id: string): Promise<Usuario | null> {
    return Promise.resolve(this.usuarios.find((usuario) => usuario.id === id) ?? null);
  }

  registrarAcceso(id: string, instante: Date): Promise<void> {
    this.accesos.push({ id, instante });
    return Promise.resolve();
  }

  crear(nuevo: UsuarioNuevo): Promise<ResultadoCrearUsuario> {
    if (this.usuarios.some((usuario) => usuario.email === nuevo.email)) {
      return Promise.resolve({ creado: false, motivo: 'correo-repetido' });
    }
    const usuario: Usuario = { id: crypto.randomUUID(), activo: true, ...nuevo };
    this.usuarios.push(usuario);
    return Promise.resolve({ creado: true, usuario });
  }

  /** Cambia una fila como lo haría un admin en la base (desactivar, cambiar el rol). */
  modificar(id: string, cambios: Partial<Pick<Usuario, 'activo' | 'rol'>>): void {
    const indice = this.usuarios.findIndex((usuario) => usuario.id === id);
    const actual = this.usuarios[indice];
    if (actual === undefined) throw new Error(`usuario ${id} inexistente`);
    this.usuarios[indice] = { ...actual, ...cambios };
  }
}
