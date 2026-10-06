import { Body, Controller, Get, HttpCode, Logger, Post, Put } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { respuestaDesdeZod, respuestaProblema } from '../../../plataforma/documentacion/index.js';
import { ErrorDeAplicacion } from '../../../plataforma/errores/index.js';
import { DocumentarRutaDeAdmin, Roles, UsuarioActual, type PerfilUsuario } from '../../usuarios/index.js';
import { ListarHistorialEstilo } from '../aplicacion/listar-historial-estilo.js';
import { ProveedorEstilo } from '../aplicacion/proveedor-estilo.js';
import { PublicarEstilo, type ResultadoPublicacion } from '../aplicacion/publicar-estilo.js';
import { RestaurarEstilo } from '../aplicacion/restaurar-estilo.js';
import type { AutorEstilo } from '../puertos/repositorio-estilo.js';
import {
  esquemaEstiloVigente,
  esquemaHistorialEstilo,
  esquemaPublicarEstilo,
  esquemaRestaurarEstilo,
  esquemaVersionEstilo,
  type EstiloVigenteRespuesta,
  type HistorialEstiloRespuesta,
  type PublicarEstiloCuerpo,
  type RestaurarEstiloCuerpo,
  type VersionEstiloRespuesta,
} from './esquemas-estilo.js';

/** El autor que se guarda con cada versión publicada o restaurada: identificador y nombre (instantánea, EST-D3). */
function autorDe(usuario: PerfilUsuario): AutorEstilo {
  return { id: usuario.id, nombre: usuario.nombre };
}

/**
 * Administración del estilo del bot por la API (AGT23, D1 de la Fase 11b), solo para `admin` (API7). Es el mismo
 * flujo del comando `prompt:estilo`: reutiliza `PublicarEstilo`, `RestaurarEstilo`, `ListarHistorialEstilo` y
 * `ProveedorEstilo`, así que la validación (AGT20), el historial (AGT21) y la invalidación de la copia en memoria (AGT19)
 * no se duplican. El controlador solo traduce resultados a HTTP. Los logs llevan la versión y el id del usuario, nunca el
 * texto del estilo (R14).
 */
@Controller('agente/estilo')
@Roles('admin')
export class EstiloController {
  private readonly logger = new Logger(EstiloController.name);

  constructor(
    private readonly proveedor: ProveedorEstilo,
    private readonly listar: ListarHistorialEstilo,
    private readonly publicar: PublicarEstilo,
    private readonly restaurar: RestaurarEstilo,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'obtenerEstilo', summary: 'Devuelve el estilo vigente del bot' })
  @DocumentarRutaDeAdmin({ mutacion: false })
  @respuestaDesdeZod(esquemaEstiloVigente, { description: 'Versión vigente (null si rige el archivo), origen y texto.' })
  async obtenerEstilo(): Promise<EstiloVigenteRespuesta> {
    const estilo = await this.proveedor.obtener();
    return {
      version: estilo.origen === 'base' ? estilo.version : null,
      origen: estilo.origen,
      texto: estilo.texto,
      publicadoPor: estilo.publicadoPor ?? null,
    };
  }

  @Get('historial')
  @ApiOperation({ operationId: 'listarHistorialEstilo', summary: 'Lista las versiones retiradas del estilo' })
  @DocumentarRutaDeAdmin({ mutacion: false })
  @respuestaDesdeZod(esquemaHistorialEstilo, { description: 'Versiones retiradas, la más reciente primero.' })
  async listarHistorialEstilo(): Promise<HistorialEstiloRespuesta> {
    const { historial } = await this.listar.ejecutar();
    return {
      versiones: historial.map(({ version, fecha, texto, publicadoPor }) => ({ version, fecha, texto, publicadoPor: publicadoPor ?? null })),
    };
  }

  @Put()
  @HttpCode(200)
  @ApiOperation({ operationId: 'publicarEstilo', summary: 'Publica un estilo nuevo' })
  @DocumentarRutaDeAdmin({ mutacion: true })
  @respuestaDesdeZod(esquemaVersionEstilo, { description: 'Versión nueva del estilo.' })
  @respuestaProblema(400, 'El cuerpo no cumple el esquema (validacion-fallida).')
  @respuestaProblema(422, 'El estilo incumple las reglas de AGT20 (estilo-invalido); el motivo va en `detail`.')
  async publicarEstilo(
    @Body({ schema: esquemaPublicarEstilo }) cuerpo: PublicarEstiloCuerpo,
    @UsuarioActual() usuario: PerfilUsuario,
  ): Promise<VersionEstiloRespuesta> {
    const version = this.versionNueva(await this.publicar.ejecutar(cuerpo.texto, autorDe(usuario)));
    this.logger.log({ evento: 'agente.estilo-publicado', version, usuarioId: usuario.id });
    return { version };
  }

  @Post('restauraciones')
  @HttpCode(200)
  @ApiOperation({ operationId: 'restaurarEstilo', summary: 'Restaura una versión del historial como versión nueva' })
  @DocumentarRutaDeAdmin({ mutacion: true })
  @respuestaDesdeZod(esquemaVersionEstilo, { description: 'Versión nueva, con el texto de la versión restaurada.' })
  @respuestaProblema(400, 'El cuerpo no cumple el esquema (validacion-fallida).')
  @respuestaProblema(404, 'La versión no está en el historial (version-estilo-inexistente).')
  @respuestaProblema(422, 'El texto de esa versión hoy incumple AGT20 (estilo-invalido); el motivo va en `detail`.')
  async restaurarEstilo(
    @Body({ schema: esquemaRestaurarEstilo }) cuerpo: RestaurarEstiloCuerpo,
    @UsuarioActual() usuario: PerfilUsuario,
  ): Promise<VersionEstiloRespuesta> {
    const version = this.versionNueva(await this.restaurar.ejecutar(cuerpo.version, autorDe(usuario)));
    this.logger.log({
      evento: 'agente.estilo-restaurado',
      version,
      versionRestaurada: cuerpo.version,
      usuarioId: usuario.id,
    });
    return { version };
  }

  /** La versión nueva, o el error de catálogo con el motivo en `detail` (el motivo nombra la regla, nunca copia el texto). */
  private versionNueva(resultado: ResultadoPublicacion): number {
    if (resultado.publicado) return resultado.version;
    throw new ErrorDeAplicacion(resultado.razon === 'version-inexistente' ? 'version-estilo-inexistente' : 'estilo-invalido', {
      detalle: resultado.motivo,
    });
  }
}
