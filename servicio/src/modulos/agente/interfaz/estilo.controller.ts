import { Body, Controller, Get, HttpCode, Logger, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { respuestaDesdeZod, respuestaProblema } from '../../../plataforma/documentacion/index.js';
import { ErrorDeAplicacion } from '../../../plataforma/errores/index.js';
import { DocumentarRutaDeAdmin, Roles, UsuarioActual, type PerfilUsuario } from '../../usuarios/index.js';
import { AdministrarSeccionesEstilo } from '../aplicacion/administrar-secciones-estilo.js';
import { ListarHistorialEstilo } from '../aplicacion/listar-historial-estilo.js';
import { ProveedorEstilo } from '../aplicacion/proveedor-estilo.js';
import { PublicarEstilo, type ResultadoPublicacion } from '../aplicacion/publicar-estilo.js';
import { RestaurarEstilo } from '../aplicacion/restaurar-estilo.js';
import { componerEstilo } from '../dominio/secciones-estilo.js';
import { MAX_CARACTERES_ESTILO } from '../dominio/validar-estilo.js';
import type { AutorEstilo } from '../puertos/repositorio-estilo.js';
import type { SeccionEstilo } from '../puertos/repositorio-secciones-estilo.js';
import {
  esquemaCrearSeccionEstilo,
  esquemaEditarSeccionEstilo,
  esquemaEstiloVigente,
  esquemaHistorialEstilo,
  esquemaIdSeccionEstilo,
  esquemaListaSeccionesEstilo,
  esquemaOrdenSeccionesEstilo,
  esquemaPublicarEstilo,
  esquemaRestaurarEstilo,
  esquemaSeccionEstilo,
  esquemaVersionEstilo,
  type CrearSeccionEstiloCuerpo,
  type EditarSeccionEstiloCuerpo,
  type EstiloVigenteRespuesta,
  type HistorialEstiloRespuesta,
  type ListaSeccionesEstiloRespuesta,
  type OrdenSeccionesEstiloCuerpo,
  type PublicarEstiloCuerpo,
  type RestaurarEstiloCuerpo,
  type SeccionEstiloRespuesta,
  type VersionEstiloRespuesta,
} from './esquemas-estilo.js';

/** El autor que se guarda con cada versión publicada o restaurada: identificador y nombre (instantánea, EST-D3). */
function autorDe(usuario: PerfilUsuario): AutorEstilo {
  return { id: usuario.id, nombre: usuario.nombre };
}

function aRespuesta(seccion: SeccionEstilo): SeccionEstiloRespuesta {
  const { id, titulo, texto, orden, activo, actualizado } = seccion;
  return { id, titulo, texto, orden, activo, actualizado: actualizado.toISOString() };
}

function aLista(secciones: readonly SeccionEstilo[]): ListaSeccionesEstiloRespuesta {
  return {
    secciones: secciones.map(aRespuesta),
    caracteresCompuestos: componerEstilo(secciones).length,
    maximo: MAX_CARACTERES_ESTILO,
  };
}

type CambioRechazado =
  | { readonly razon: 'inexistente' | 'modificado' | 'duplicada' | 'no-coincide' }
  | { readonly razon: 'invalido'; readonly motivo: string };

/** El error de catálogo de un cambio rechazado; el motivo de `invalido` nombra la regla, nunca copia el texto (R14). */
function errorDeSeccion(resultado: CambioRechazado): ErrorDeAplicacion {
  switch (resultado.razon) {
    case 'inexistente':
      return new ErrorDeAplicacion('seccion-inexistente');
    case 'modificado':
      return new ErrorDeAplicacion('seccion-modificada');
    case 'duplicada':
      return new ErrorDeAplicacion('seccion-duplicada');
    case 'no-coincide':
      return new ErrorDeAplicacion('orden-secciones-invalido');
    case 'invalido':
      return new ErrorDeAplicacion('estilo-invalido', { detalle: resultado.motivo });
  }
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
    private readonly secciones: AdministrarSeccionesEstilo,
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

  // --- Secciones (EST-API) ------------------------------------------------------------------------------------------

  @Get('secciones')
  @ApiOperation({ operationId: 'listarSeccionesEstilo', summary: 'Lista las secciones del estilo, activas o no, en su orden' })
  @DocumentarRutaDeAdmin({ mutacion: false })
  @respuestaDesdeZod(esquemaListaSeccionesEstilo, { description: 'Las secciones por orden, el largo del estilo compuesto y su máximo.' })
  async listarSeccionesEstilo(): Promise<ListaSeccionesEstiloRespuesta> {
    return aLista(await this.secciones.listar());
  }

  @Post('secciones')
  @HttpCode(201)
  @ApiOperation({ operationId: 'crearSeccionEstilo', summary: 'Crea una sección al final del estilo' })
  @DocumentarRutaDeAdmin({ mutacion: true })
  @respuestaDesdeZod(esquemaSeccionEstilo, { description: 'La sección creada, activa salvo que se indique otra cosa.', status: 201 })
  @respuestaProblema(400, 'El cuerpo no cumple el esquema (validacion-fallida).')
  @respuestaProblema(409, 'Ya existe una sección con ese título (seccion-duplicada).')
  @respuestaProblema(422, 'La sección o el estilo compuesto incumplen las reglas de AGT20 (estilo-invalido); el motivo va en `detail`.')
  async crearSeccionEstilo(
    @Body({ schema: esquemaCrearSeccionEstilo }) cuerpo: CrearSeccionEstiloCuerpo,
    @UsuarioActual() usuario: PerfilUsuario,
  ): Promise<SeccionEstiloRespuesta> {
    const resultado = await this.secciones.crear({ ...cuerpo, activo: cuerpo.activo ?? true }, autorDe(usuario));
    if (!resultado.ok) throw errorDeSeccion(resultado);
    this.logger.log({ evento: 'agente.seccion-estilo-creada', seccionId: resultado.valor.id, version: resultado.version, usuarioId: usuario.id });
    return aRespuesta(resultado.valor);
  }

  @Patch('secciones/:id')
  @HttpCode(200)
  @ApiOperation({ operationId: 'editarSeccionEstilo', summary: 'Edita una sección con la fecha de actualización que se leyó' })
  @DocumentarRutaDeAdmin({ mutacion: true })
  @respuestaDesdeZod(esquemaSeccionEstilo, { description: 'La sección con los cambios y una fecha de actualización posterior.' })
  @respuestaProblema(400, 'El identificador o el cuerpo no cumplen el esquema (validacion-fallida).')
  @respuestaProblema(404, 'La sección no existe (seccion-inexistente).')
  @respuestaProblema(409, 'Otro admin la modificó o el título ya existe (seccion-modificada, seccion-duplicada).')
  @respuestaProblema(422, 'La sección o el estilo compuesto incumplen las reglas de AGT20 (estilo-invalido); el motivo va en `detail`.')
  async editarSeccionEstilo(
    @Param('id', { schema: esquemaIdSeccionEstilo }) id: string,
    @Body({ schema: esquemaEditarSeccionEstilo }) cuerpo: EditarSeccionEstiloCuerpo,
    @UsuarioActual() usuario: PerfilUsuario,
  ): Promise<SeccionEstiloRespuesta> {
    const actual = (await this.secciones.listar()).find((seccion) => seccion.id === id);
    if (actual === undefined) throw new ErrorDeAplicacion('seccion-inexistente');
    const resultado = await this.secciones.editar(
      id,
      { titulo: cuerpo.titulo ?? actual.titulo, texto: cuerpo.texto ?? actual.texto, activo: cuerpo.activo ?? actual.activo },
      new Date(cuerpo.actualizado),
      autorDe(usuario),
    );
    if (!resultado.ok) throw errorDeSeccion(resultado);
    this.logger.log({ evento: 'agente.seccion-estilo-editada', seccionId: id, version: resultado.version, usuarioId: usuario.id });
    return aRespuesta(resultado.valor);
  }

  @Put('secciones/orden')
  @HttpCode(200)
  @ApiOperation({ operationId: 'ordenarSeccionesEstilo', summary: 'Reordena las secciones con la lista completa de sus identificadores' })
  @DocumentarRutaDeAdmin({ mutacion: true })
  @respuestaDesdeZod(esquemaListaSeccionesEstilo, { description: 'Las secciones en el orden nuevo.' })
  @respuestaProblema(400, 'El cuerpo no cumple el esquema (validacion-fallida).')
  @respuestaProblema(422, 'La lista no coincide con las secciones existentes (orden-secciones-invalido).')
  async reordenarSeccionesEstilo(
    @Body({ schema: esquemaOrdenSeccionesEstilo }) cuerpo: OrdenSeccionesEstiloCuerpo,
    @UsuarioActual() usuario: PerfilUsuario,
  ): Promise<ListaSeccionesEstiloRespuesta> {
    const resultado = await this.secciones.reordenar(cuerpo.ids, autorDe(usuario));
    if (!resultado.ok) throw errorDeSeccion(resultado);
    this.logger.log({ evento: 'agente.secciones-estilo-ordenadas', version: resultado.version, usuarioId: usuario.id });
    return aLista(resultado.valor);
  }

  /** La versión nueva, o el error de catálogo con el motivo en `detail` (el motivo nombra la regla, nunca copia el texto). */
  private versionNueva(resultado: ResultadoPublicacion): number {
    if (resultado.publicado) return resultado.version;
    throw new ErrorDeAplicacion(resultado.razon === 'version-inexistente' ? 'version-estilo-inexistente' : 'estilo-invalido', {
      detalle: resultado.motivo,
    });
  }
}
