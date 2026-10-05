import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  CrearUsuario,
  type LectorContrasena,
  type MotivoUsuarioNoCreado,
  type Rol,
  UsuariosModule,
} from '../src/modulos/usuarios/index.js';
import { ConfiguracionModule } from '../src/plataforma/config/index.js';
import { RelojModule } from '../src/plataforma/reloj/index.js';

/** Falla al parsear los argumentos de `usuario:crear` (USR10). */
export class ArgumentosUsuarioInvalidos extends Error {}

export interface ArgumentosUsuario {
  readonly email: string;
  readonly nombre: string;
  readonly rol: Rol;
}

export interface ResultadoUsuarioCrearCli {
  readonly limpio: boolean;
  readonly mensaje: string;
}

export interface DependenciasUsuarioCrear {
  readonly crear: Pick<CrearUsuario, 'ejecutar'>;
  readonly lector: LectorContrasena;
}

const USO = 'Uso: npm run usuario:crear -- --email <correo> --nombre <nombre> --rol admin|asesor';

function valorDeFlag(argumentos: readonly string[], nombre: string): string | null {
  const indice = argumentos.indexOf(nombre);
  return indice === -1 ? null : (argumentos[indice + 1] ?? null);
}

/** Parsea los argumentos (USR10). Función pura; la contraseña nunca llega por aquí. */
export function parsearArgumentosUsuario(argumentos: readonly string[]): ArgumentosUsuario {
  if (argumentos.some((argumento) => /^--(contrasena|password|clave)/i.test(argumento))) {
    throw new ArgumentosUsuarioInvalidos('usuario:crear nunca acepta la contraseña por argumento: la pide en la consola.');
  }
  const email = valorDeFlag(argumentos, '--email');
  const nombre = valorDeFlag(argumentos, '--nombre');
  const rol = valorDeFlag(argumentos, '--rol');
  if (email === null) throw new ArgumentosUsuarioInvalidos(`usuario:crear exige --email. ${USO}`);
  if (nombre === null) throw new ArgumentosUsuarioInvalidos(`usuario:crear exige --nombre. ${USO}`);
  if (rol === null) throw new ArgumentosUsuarioInvalidos(`usuario:crear exige --rol. ${USO}`);
  if (rol !== 'admin' && rol !== 'asesor') {
    throw new ArgumentosUsuarioInvalidos('usuario:crear: --rol debe ser admin|asesor.');
  }
  return { email, nombre, rol };
}

const MOTIVOS: Readonly<Record<MotivoUsuarioNoCreado, string>> = {
  'sin-terminal': 'hace falta una terminal interactiva para pedir la contraseña; no se leyó nada.',
  corta: 'la contraseña debe tener al menos 12 caracteres.',
  larga: 'la contraseña no puede pasar de 200 caracteres.',
  'no-coincide': 'las dos contraseñas no coinciden.',
  'correo-repetido': 'ya existe un usuario con ese correo; no se modificó.',
  'correo-invalido': 'el correo no tiene un formato válido.',
  'nombre-vacio': 'el nombre no puede quedar vacío.',
};

/** Ejecuta el caso de uso y arma el reporte. Nunca copia la contraseña ni el hash en el mensaje (USR10, R14). */
export async function ejecutarCrearUsuario(
  argumentos: readonly string[],
  dependencias: DependenciasUsuarioCrear,
): Promise<ResultadoUsuarioCrearCli> {
  let datos: ArgumentosUsuario;
  try {
    datos = parsearArgumentosUsuario(argumentos);
  } catch (error) {
    return { limpio: false, mensaje: (error as Error).message };
  }
  const resultado = await dependencias.crear.ejecutar(datos, dependencias.lector);
  if (!resultado.creado) {
    return { limpio: false, mensaje: `usuario:crear: no se creó el usuario: ${MOTIVOS[resultado.motivo]}` };
  }
  return {
    limpio: true,
    mensaje: `usuario:crear: usuario creado (id ${resultado.usuario.id}, rol ${resultado.usuario.rol}).`,
  };
}

/**
 * Lector real (D7, registro de compatibilidad de T1): `node:readline` con una salida que descarta lo tecleado
 * mientras se pide la contraseña. Exige `stdin` como TTY.
 */
class LectorContrasenaConsola implements LectorContrasena {
  esInteractivo(): boolean {
    return process.stdin.isTTY;
  }

  leer(pregunta: string): Promise<string> {
    let silenciado = false;
    const salida = new Writable({
      write(fragmento: Buffer | string, codificacion: BufferEncoding, listo: () => void) {
        if (!silenciado) process.stdout.write(fragmento, codificacion);
        listo();
      },
    });
    const lector = createInterface({ input: process.stdin, output: salida, terminal: true });
    process.stdout.write(pregunta);
    silenciado = true;
    return new Promise((resolver) => {
      lector.question('', (respuesta) => {
        silenciado = false;
        process.stdout.write('\n');
        lector.close();
        resolver(respuesta);
      });
    });
  }
}

/** Contexto mínimo del comando: configuración, reloj y `usuarios`, sin HTTP ni colas. */
@Module({ imports: [ConfiguracionModule, RelojModule, UsuariosModule] })
class ContextoUsuarioCrear {}

/** Comando `npm run usuario:crear` (USR10). */
export async function usuarioCrear(argumentos: readonly string[]): Promise<ResultadoUsuarioCrearCli> {
  try {
    parsearArgumentosUsuario(argumentos);
  } catch (error) {
    return { limpio: false, mensaje: (error as Error).message };
  }
  const lector = new LectorContrasenaConsola();
  if (!lector.esInteractivo()) {
    return { limpio: false, mensaje: `usuario:crear: no se creó el usuario: ${MOTIVOS['sin-terminal']}` };
  }
  const contexto = await NestFactory.createApplicationContext(ContextoUsuarioCrear, { logger: false });
  try {
    return await ejecutarCrearUsuario(argumentos, { crear: contexto.get(CrearUsuario), lector });
  } catch (error) {
    return { limpio: false, mensaje: `usuario:crear: fallo inesperado: ${(error as Error).message}` };
  } finally {
    await contexto.close();
  }
}
