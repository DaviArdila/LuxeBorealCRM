import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { CONFIGURACION, type Configuracion } from '../../../plataforma/config/index.js';
import { respuestaDesdeZod, respuestaProblema } from '../../../plataforma/documentacion/index.js';
import { ErrorDeAplicacion } from '../../../plataforma/errores/index.js';
import { CerrarSesion } from '../aplicacion/cerrar-sesion.js';
import { IniciarSesion } from '../aplicacion/iniciar-sesion.js';
import type { PerfilUsuario } from '../dominio/usuario.js';
import { Publico } from './decoradores.js';
import { DocumentarCsrf, DocumentarSesionRequerida } from './documentacion.js';
import { esquemaInicioSesion, esquemaPerfilUsuario, type InicioSesion } from './esquemas.js';
import { leerIdSesion, NOMBRE_COOKIE_SESION, type SolicitudHttp } from './solicitud.js';

interface OpcionesCookie {
  readonly httpOnly: true;
  readonly sameSite: 'strict';
  readonly path: '/';
  readonly secure: boolean;
}

/** Lo que el controlador usa de la respuesta de Express, sin depender de sus tipos. */
interface RespuestaConCookies {
  cookie(nombre: string, valor: string, opciones: OpcionesCookie): void;
  clearCookie(nombre: string, opciones: OpcionesCookie): void;
  setHeader(nombre: string, valor: string): void;
}

/**
 * Inicio, cierre y consulta de la sesión (USR1-USR5, D1). Solo traduce el resultado de los casos de uso a HTTP y pone
 * o vacía la cookie: las guardias globales ya decidieron CSRF, sesión y rol. `auth/sesion` va en singular porque es la
 * sesión de quien llama (excepción declarada a API2 en `design.md`).
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly iniciarSesion: IniciarSesion,
    private readonly cerrarSesion: CerrarSesion,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  @Post('sesion')
  @Publico()
  @HttpCode(200)
  @ApiOperation({ operationId: 'iniciarSesion', summary: 'Inicia sesión con correo y contraseña', security: [] })
  @DocumentarCsrf()
  @respuestaDesdeZod(esquemaPerfilUsuario, { description: 'Sesión abierta; la cookie luxe_sesion viene en Set-Cookie.' })
  @respuestaProblema(400, 'El cuerpo no cumple el esquema (validacion-fallida).')
  @respuestaProblema(401, 'Correo o contraseña no válidos, o usuario inactivo (credenciales-invalidas).')
  @respuestaProblema(429, 'Demasiados intentos para este correo e IP (demasiados-intentos); ver Retry-After.')
  async iniciar(
    @Body({ schema: esquemaInicioSesion }) cuerpo: InicioSesion,
    @Req() solicitud: SolicitudHttp,
    @Res({ passthrough: true }) respuesta: RespuestaConCookies,
  ): Promise<PerfilUsuario> {
    const resultado = await this.iniciarSesion.ejecutar({
      email: cuerpo.email,
      contrasena: cuerpo.contrasena,
      ip: solicitud.ip ?? 'desconocida',
    });
    if (resultado.resultado === 'demasiados-intentos') {
      respuesta.setHeader('Retry-After', String(resultado.reintentarEnS));
      throw new ErrorDeAplicacion('demasiados-intentos');
    }
    if (resultado.resultado === 'credenciales-invalidas') {
      throw new ErrorDeAplicacion('credenciales-invalidas');
    }
    respuesta.cookie(NOMBRE_COOKIE_SESION, resultado.idSesion, this.opcionesCookie());
    return resultado.usuario;
  }

  @Delete('sesion')
  @Publico()
  @HttpCode(204)
  @ApiOperation({ operationId: 'cerrarSesion', summary: 'Cierra la sesión de quien llama', security: [] })
  @DocumentarCsrf()
  @respuestaDesdeZod(esquemaPerfilUsuario.optional(), { status: 204, description: 'Sesión cerrada; la cookie queda vencida.' })
  async cerrar(@Req() solicitud: SolicitudHttp, @Res({ passthrough: true }) respuesta: RespuestaConCookies): Promise<void> {
    await this.cerrarSesion.ejecutar(leerIdSesion(solicitud));
    respuesta.clearCookie(NOMBRE_COOKIE_SESION, this.opcionesCookie());
  }

  @Get('yo')
  @ApiOperation({ operationId: 'obtenerSesionActual', summary: 'Devuelve el usuario de la sesión actual' })
  @DocumentarSesionRequerida()
  @respuestaDesdeZod(esquemaPerfilUsuario, { description: 'Usuario de la sesión, leído de la base.' })
  obtenerYo(@Req() solicitud: SolicitudHttp): PerfilUsuario {
    // `GuardiaSesion` ya dejó el perfil; si faltara, la ruta habría respondido 401 antes de llegar aquí.
    if (solicitud.usuario === undefined) throw new ErrorDeAplicacion('peticion-no-autenticada');
    return solicitud.usuario;
  }

  /** USR2: `Secure` sale de `NODE_ENV` y no de una variable aparte, para que no se pueda apagar en producción. */
  private opcionesCookie(): OpcionesCookie {
    return { httpOnly: true, sameSite: 'strict', path: '/', secure: this.configuracion.NODE_ENV !== 'development' };
  }
}
