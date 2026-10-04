import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../plataforma/reloj/index.js';
import { normalizarEmail, perfilDe, type PerfilUsuario } from '../dominio/usuario.js';
import { ALMACEN_SESIONES, type AlmacenSesiones } from '../puertos/almacen-sesiones.js';
import { HASHEADOR_CONTRASENA, type HasheadorContrasena } from '../puertos/hasheador-contrasena.js';
import { LIMITE_INTENTOS, type LimiteIntentos } from '../puertos/limite-intentos.js';
import { REPOSITORIO_USUARIO, type RepositorioUsuario } from '../puertos/repositorio-usuario.js';

export interface EntradaInicioSesion {
  readonly email: string;
  readonly contrasena: string;
  /** IP de origen de la petición, para el límite por correo e IP (USR8). */
  readonly ip: string;
}

export type ResultadoInicioSesion =
  | { readonly resultado: 'sesion-abierta'; readonly idSesion: string; readonly usuario: PerfilUsuario }
  | { readonly resultado: 'credenciales-invalidas' }
  | { readonly resultado: 'demasiados-intentos'; readonly reintentarEnS: number };

const CREDENCIALES_INVALIDAS = { resultado: 'credenciales-invalidas' } as const;

/**
 * Abre una sesión con correo y contraseña (USR1, USR8, D5, D6): límite de intentos → buscar → verificar argon2id
 * (contra el hash ficticio si el correo no existe) → crear la sesión → registrar el acceso con el `Clock`. Correo
 * inexistente, contraseña incorrecta y usuario inactivo dan el mismo resultado, y los tres verifican una contraseña
 * para que el tiempo no los distinga. Los logs solo llevan el id del usuario (USR9, R14).
 */
@Injectable()
export class IniciarSesion {
  private readonly logger = new Logger(IniciarSesion.name);

  constructor(
    @Inject(REPOSITORIO_USUARIO) private readonly repositorio: RepositorioUsuario,
    @Inject(ALMACEN_SESIONES) private readonly sesiones: AlmacenSesiones,
    @Inject(HASHEADOR_CONTRASENA) private readonly hasheador: HasheadorContrasena,
    @Inject(LIMITE_INTENTOS) private readonly limite: LimiteIntentos,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async ejecutar(entrada: EntradaInicioSesion): Promise<ResultadoInicioSesion> {
    const email = normalizarEmail(entrada.email);
    const intento = await this.limite.consumirIntento(email, entrada.ip);
    if (!intento.permitido) {
      return { resultado: 'demasiados-intentos', reintentarEnS: intento.reintentarEnS };
    }

    const usuario = await this.repositorio.buscarPorEmail(email);
    if (usuario === null) {
      await this.hasheador.verificarFicticio(entrada.contrasena);
      return CREDENCIALES_INVALIDAS;
    }
    const coincide = await this.hasheador.verificar(usuario.passwordHash, entrada.contrasena);
    if (!coincide || !usuario.activo) {
      return CREDENCIALES_INVALIDAS;
    }

    const ahora = this.clock.ahora();
    const idSesion = await this.sesiones.crear({ usuarioId: usuario.id, creada: ahora, ultimaActividad: ahora });
    await this.limite.reiniciar(email, entrada.ip);
    await this.repositorio.registrarAcceso(usuario.id, ahora);
    this.logger.log(`Sesión abierta: usuario=${usuario.id}`);
    return { resultado: 'sesion-abierta', idSesion, usuario: perfilDe(usuario) };
  }
}
