import { Body, Controller, Get, HttpCode, Logger, Param, Put } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { respuestaDesdeZod, respuestaProblema } from '../../../plataforma/documentacion/index.js';
import { ErrorDeAplicacion } from '../../../plataforma/errores/index.js';
import { DocumentarRutaDeAdmin, Roles, UsuarioActual, type PerfilUsuario } from '../../usuarios/index.js';
import { GuardarMensajeFijo } from '../aplicacion/guardar-mensaje-fijo.js';
import { ListarMensajesFijos } from '../aplicacion/listar-mensajes-fijos.js';
import type { MensajeFijo } from '../dominio/mensaje-fijo.js';
import {
  esquemaGuardarMensajeFijo,
  esquemaListaMensajesFijos,
  esquemaMensajeFijo,
  type GuardarMensajeFijoCuerpo,
  type ListaMensajesFijosRespuesta,
} from './esquemas-mensajes-fijos.js';

/**
 * Administración de los mensajes fijos del bot por la API (CFN1, CFN2, D2 de la Fase 11b), solo para `admin` (API7). El
 * controlador solo traduce resultados de los casos de uso a HTTP: la lista cerrada, la validación y la escritura en
 * `parametro` viven en `mensajes-fijos`. Los logs llevan la clave y el id del usuario, nunca el texto (R14).
 */
@Controller('mensajes-fijos')
@Roles('admin')
export class MensajesFijosController {
  private readonly logger = new Logger(MensajesFijosController.name);

  constructor(
    private readonly listar: ListarMensajesFijos,
    private readonly guardar: GuardarMensajeFijo,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'listarMensajesFijos', summary: 'Lista los mensajes fijos editables del bot' })
  @DocumentarRutaDeAdmin({ mutacion: false })
  @respuestaDesdeZod(esquemaListaMensajesFijos, {
    description: 'Cada mensaje con su descripción, su texto vigente, su origen (base o respaldo) y la fecha de su última edición.',
  })
  async listarMensajesFijos(): Promise<ListaMensajesFijosRespuesta> {
    return { mensajes: [...(await this.listar.ejecutar())] };
  }

  @Put(':clave')
  @HttpCode(200)
  @ApiOperation({ operationId: 'guardarMensajeFijo', summary: 'Guarda el texto de un mensaje fijo' })
  @DocumentarRutaDeAdmin({ mutacion: true })
  @respuestaDesdeZod(esquemaMensajeFijo, { description: 'El mensaje guardado, con origen base y la fecha de la edición.' })
  @respuestaProblema(400, 'El cuerpo no cumple el esquema (validacion-fallida).')
  @respuestaProblema(404, 'La clave no está en la lista de mensajes editables (mensaje-fijo-desconocido).')
  @respuestaProblema(422, 'El texto incumple las reglas de CFN2 (mensaje-fijo-invalido); el motivo va en `detail`.')
  async guardarMensajeFijo(
    @Param('clave') clave: string,
    @Body({ schema: esquemaGuardarMensajeFijo }) cuerpo: GuardarMensajeFijoCuerpo,
    @UsuarioActual() usuario: PerfilUsuario,
  ): Promise<MensajeFijo> {
    const resultado = await this.guardar.ejecutar(clave, cuerpo.texto);
    if (!resultado.guardado) {
      throw resultado.razon === 'desconocida'
        ? new ErrorDeAplicacion('mensaje-fijo-desconocido')
        : new ErrorDeAplicacion('mensaje-fijo-invalido', { detalle: resultado.motivo });
    }
    this.logger.log({ evento: 'mensajes-fijos.guardado', clave: resultado.mensaje.clave, usuarioId: usuario.id });
    return resultado.mensaje;
  }
}
