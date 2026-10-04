import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { validarContrasenaNueva, type MotivoContrasenaInvalida } from '../dominio/contrasena.js';
import { normalizarEmail, perfilDe, type PerfilUsuario, type Rol } from '../dominio/usuario.js';
import { HASHEADOR_CONTRASENA, type HasheadorContrasena } from '../puertos/hasheador-contrasena.js';
import type { LectorContrasena } from '../puertos/lector-contrasena.js';
import { REPOSITORIO_USUARIO, type RepositorioUsuario } from '../puertos/repositorio-usuario.js';

export interface DatosUsuarioNuevo {
  readonly email: string;
  readonly nombre: string;
  readonly rol: Rol;
}

export type MotivoUsuarioNoCreado =
  | MotivoContrasenaInvalida
  | 'sin-terminal'
  | 'correo-invalido'
  | 'nombre-vacio'
  | 'correo-repetido';

export type ResultadoCrearUsuarioCli =
  | { readonly creado: true; readonly usuario: PerfilUsuario }
  | { readonly creado: false; readonly motivo: MotivoUsuarioNoCreado };

const esquemaCorreo = z.email();

/**
 * Crea un usuario desde la consola (USR10, D7): valida el correo y el nombre, pide la contraseña dos veces por el
 * lector (sin terminal no pide nada), guarda solo el hash argon2id con el correo en minúsculas y nunca pisa a un
 * usuario existente. Un correo repetido se detecta antes de pedir la contraseña; el repositorio lo vuelve a
 * comprobar al insertar por si otro proceso lo creó entre tanto.
 */
@Injectable()
export class CrearUsuario {
  constructor(
    @Inject(REPOSITORIO_USUARIO) private readonly repositorio: RepositorioUsuario,
    @Inject(HASHEADOR_CONTRASENA) private readonly hasheador: HasheadorContrasena,
  ) {}

  async ejecutar(datos: DatosUsuarioNuevo, lector: LectorContrasena): Promise<ResultadoCrearUsuarioCli> {
    if (!lector.esInteractivo()) return { creado: false, motivo: 'sin-terminal' };
    const email = normalizarEmail(datos.email);
    if (!esquemaCorreo.safeParse(email).success) return { creado: false, motivo: 'correo-invalido' };
    const nombre = datos.nombre.trim();
    if (nombre === '') return { creado: false, motivo: 'nombre-vacio' };
    if ((await this.repositorio.buscarPorEmail(email)) !== null) return { creado: false, motivo: 'correo-repetido' };

    const contrasena = await lector.leer('Contraseña: ');
    const confirmacion = await lector.leer('Repite la contraseña: ');
    const validacion = validarContrasenaNueva(contrasena, confirmacion);
    if (!validacion.valida) return { creado: false, motivo: validacion.motivo };

    const passwordHash = await this.hasheador.hashear(contrasena);
    const resultado = await this.repositorio.crear({ email, nombre, passwordHash, rol: datos.rol });
    if (!resultado.creado) return { creado: false, motivo: resultado.motivo };
    return { creado: true, usuario: perfilDe(resultado.usuario) };
  }
}
