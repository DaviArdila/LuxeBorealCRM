import { Body, Controller, Delete, Get, HttpCode, Logger, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation } from '@nestjs/swagger';
import { respuestaDesdeZod, respuestaProblema } from '../../../plataforma/documentacion/index.js';
import { ErrorDeAplicacion } from '../../../plataforma/errores/index.js';
import { DocumentarRutaDeAdmin, Roles, UsuarioActual, type PerfilUsuario } from '../../usuarios/index.js';
import { AdministrarCasos, CursorInvalido } from '../aplicacion/administrar-casos.js';
import { AdministrarCategorias } from '../aplicacion/administrar-categorias.js';
import type { CasoAdmin } from '../dominio/administracion.js';
import {
  esquemaCasoAsistente,
  esquemaCategoriaCaso,
  esquemaConsultaCasos,
  esquemaCrearCaso,
  esquemaEditarCaso,
  esquemaIdCaso,
  esquemaListaCategoriasCaso,
  esquemaNombreCategoria,
  esquemaOrdenCategorias,
  esquemaPaginaCasos,
  type CasoAsistenteRespuesta,
  type CategoriaCasoRespuesta,
  type ConsultaCasosQuery,
  type CrearCasoCuerpo,
  type EditarCasoCuerpo,
  type ListaCategoriasCasoRespuesta,
  type NombreCategoriaCuerpo,
  type OrdenCategoriasCuerpo,
  type PaginaCasosRespuesta,
} from './esquemas-asistente.js';

function aRespuesta(caso: CasoAdmin): CasoAsistenteRespuesta {
  return {
    id: caso.id,
    categoriaId: caso.categoriaId,
    categoriaNombre: caso.categoriaNombre,
    titulo: caso.titulo,
    cuandoAplica: caso.cuandoAplica,
    texto: caso.texto,
    modo: caso.modo,
    disparador: caso.disparador,
    claveSistema: caso.claveSistema,
    activo: caso.activo,
    creado: caso.creado.toISOString(),
    actualizado: caso.actualizado.toISOString(),
  };
}

/**
 * Administración de categorías y casos del asistente por la API (CAS9, CAS10), solo para `admin` (API7). El controlador solo
 * traduce resultados de los casos de uso a HTTP y a errores de catálogo con códigos estables. Los logs llevan el identificador
 * y el usuario, nunca el texto de un caso ni lo que se busca (R14).
 */
@Controller('asistente')
@Roles('admin')
export class AsistenteController {
  private readonly logger = new Logger(AsistenteController.name);

  constructor(
    private readonly categorias: AdministrarCategorias,
    private readonly casos: AdministrarCasos,
  ) {}

  // --- Categorías ---------------------------------------------------------------------------------------------------

  @Get('categorias')
  @ApiOperation({ operationId: 'listarCategoriasCaso', summary: 'Lista las categorías de casos, en orden y con su cantidad de casos' })
  @DocumentarRutaDeAdmin({ mutacion: false })
  @respuestaDesdeZod(esquemaListaCategoriasCaso, { description: 'Las categorías en el orden en que se muestran.' })
  async listarCategoriasCaso(): Promise<ListaCategoriasCasoRespuesta> {
    return { categorias: [...(await this.categorias.listar())] };
  }

  @Post('categorias')
  @HttpCode(201)
  @ApiOperation({ operationId: 'crearCategoriaCaso', summary: 'Crea una categoría al final del orden' })
  @DocumentarRutaDeAdmin({ mutacion: true })
  @respuestaDesdeZod(esquemaCategoriaCaso, { description: 'La categoría creada.', status: 201 })
  @respuestaProblema(400, 'El cuerpo no cumple el esquema (validacion-fallida).')
  @respuestaProblema(409, 'Ya existe una categoría con ese nombre (categoria-duplicada).')
  @respuestaProblema(422, 'El nombre está vacío o es demasiado largo (categoria-invalida).')
  async crearCategoriaCaso(
    @Body({ schema: esquemaNombreCategoria }) cuerpo: NombreCategoriaCuerpo,
    @UsuarioActual() usuario: PerfilUsuario,
  ): Promise<CategoriaCasoRespuesta> {
    const resultado = await this.categorias.crear(cuerpo.nombre);
    if (!resultado.ok) throw this.errorDeCategoria(resultado);
    this.logger.log({ evento: 'asistente.categoria-creada', categoriaId: resultado.categoria.id, usuarioId: usuario.id });
    return resultado.categoria;
  }

  @Patch('categorias/:id')
  @HttpCode(200)
  @ApiOperation({ operationId: 'renombrarCategoriaCaso', summary: 'Renombra una categoría' })
  @DocumentarRutaDeAdmin({ mutacion: true })
  @respuestaDesdeZod(esquemaCategoriaCaso, { description: 'La categoría con su nombre nuevo; sus casos siguen asociados.' })
  @respuestaProblema(400, 'El identificador o el cuerpo no cumplen el esquema (validacion-fallida).')
  @respuestaProblema(404, 'La categoría no existe (categoria-inexistente).')
  @respuestaProblema(409, 'Ya existe una categoría con ese nombre (categoria-duplicada).')
  @respuestaProblema(422, 'El nombre está vacío o es demasiado largo (categoria-invalida).')
  async renombrarCategoriaCaso(
    @Param('id', { schema: esquemaIdCaso }) id: string,
    @Body({ schema: esquemaNombreCategoria }) cuerpo: NombreCategoriaCuerpo,
    @UsuarioActual() usuario: PerfilUsuario,
  ): Promise<CategoriaCasoRespuesta> {
    const resultado = await this.categorias.renombrar(id, cuerpo.nombre);
    if (!resultado.ok) throw this.errorDeCategoria(resultado);
    this.logger.log({ evento: 'asistente.categoria-renombrada', categoriaId: id, usuarioId: usuario.id });
    return resultado.categoria;
  }

  @Put('categorias/orden')
  @HttpCode(200)
  @ApiOperation({ operationId: 'ordenarCategoriasCaso', summary: 'Reordena las categorías con la lista completa de sus identificadores' })
  @DocumentarRutaDeAdmin({ mutacion: true })
  @respuestaDesdeZod(esquemaListaCategoriasCaso, { description: 'Las categorías en el orden nuevo.' })
  @respuestaProblema(400, 'El cuerpo no cumple el esquema (validacion-fallida).')
  @respuestaProblema(422, 'La lista no coincide con las categorías existentes (orden-categorias-invalido).')
  async ordenarCategoriasCaso(
    @Body({ schema: esquemaOrdenCategorias }) cuerpo: OrdenCategoriasCuerpo,
    @UsuarioActual() usuario: PerfilUsuario,
  ): Promise<ListaCategoriasCasoRespuesta> {
    const resultado = await this.categorias.ordenar(cuerpo.ids);
    if (!resultado.ok) throw new ErrorDeAplicacion('orden-categorias-invalido');
    this.logger.log({ evento: 'asistente.categorias-ordenadas', usuarioId: usuario.id });
    return { categorias: [...resultado.categorias] };
  }

  @Delete('categorias/:id')
  @HttpCode(204)
  @ApiOperation({ operationId: 'borrarCategoriaCaso', summary: 'Borra una categoría sin casos' })
  @DocumentarRutaDeAdmin({ mutacion: true })
  @ApiNoContentResponse({ description: 'La categoría se borró.' })
  @respuestaProblema(400, 'El identificador no cumple el esquema (validacion-fallida).')
  @respuestaProblema(404, 'La categoría no existe (categoria-inexistente).')
  @respuestaProblema(409, 'La categoría tiene casos: primero hay que moverlos o borrarlos (categoria-con-casos).')
  async borrarCategoriaCaso(@Param('id', { schema: esquemaIdCaso }) id: string, @UsuarioActual() usuario: PerfilUsuario): Promise<void> {
    const resultado = await this.categorias.borrar(id);
    if (!resultado.ok) {
      throw new ErrorDeAplicacion(resultado.razon === 'con-casos' ? 'categoria-con-casos' : 'categoria-inexistente');
    }
    this.logger.log({ evento: 'asistente.categoria-borrada', categoriaId: id, usuarioId: usuario.id });
  }

  // --- Casos --------------------------------------------------------------------------------------------------------

  @Get('casos')
  @ApiOperation({ operationId: 'listarCasos', summary: 'Lista los casos con búsqueda, filtros y paginación por cursor' })
  @DocumentarRutaDeAdmin({ mutacion: false })
  @respuestaDesdeZod(esquemaPaginaCasos, { description: 'Una página de casos por orden de categoría y título, con el cursor de la siguiente.' })
  @respuestaProblema(400, 'Los parámetros no cumplen el esquema o el cursor no es válido (validacion-fallida, cursor-invalido).')
  async listarCasos(@Query({ schema: esquemaConsultaCasos }) consulta: ConsultaCasosQuery): Promise<PaginaCasosRespuesta> {
    try {
      const pagina = await this.casos.listar(consulta);
      return { items: pagina.items.map(aRespuesta), siguienteCursor: pagina.siguienteCursor };
    } catch (error) {
      if (error instanceof CursorInvalido) throw new ErrorDeAplicacion('cursor-invalido');
      throw error;
    }
  }

  @Post('casos')
  @HttpCode(201)
  @ApiOperation({ operationId: 'crearCaso', summary: 'Crea un caso de intención' })
  @DocumentarRutaDeAdmin({ mutacion: true })
  @respuestaDesdeZod(esquemaCasoAsistente, { description: 'El caso creado: activo, en modo literal salvo que se indique otro.', status: 201 })
  @respuestaProblema(400, 'El cuerpo no cumple el esquema (validacion-fallida).')
  @respuestaProblema(404, 'La categoría no existe (categoria-inexistente).')
  @respuestaProblema(409, 'Ya existe un caso con ese título (caso-duplicado).')
  @respuestaProblema(422, 'El caso incumple las reglas de CAS5 o trae una clave del sistema (caso-invalido); el motivo va en `detail`.')
  async crearCaso(
    @Body({ schema: esquemaCrearCaso }) cuerpo: CrearCasoCuerpo,
    @UsuarioActual() usuario: PerfilUsuario,
  ): Promise<CasoAsistenteRespuesta> {
    const resultado = await this.casos.crear({ ...cuerpo, cuandoAplica: cuerpo.cuandoAplica ?? '' });
    if (!resultado.ok) throw this.errorDeCaso(resultado);
    this.logger.log({ evento: 'asistente.caso-creado', casoId: resultado.caso.id, usuarioId: usuario.id });
    return aRespuesta(resultado.caso);
  }

  @Get('casos/:id')
  @ApiOperation({ operationId: 'obtenerCaso', summary: 'Devuelve un caso' })
  @DocumentarRutaDeAdmin({ mutacion: false })
  @respuestaDesdeZod(esquemaCasoAsistente, { description: 'El caso, con la fecha de actualización con la que se edita.' })
  @respuestaProblema(400, 'El identificador no cumple el esquema (validacion-fallida).')
  @respuestaProblema(404, 'El caso no existe (caso-inexistente).')
  async obtenerCaso(@Param('id', { schema: esquemaIdCaso }) id: string): Promise<CasoAsistenteRespuesta> {
    const caso = await this.casos.obtener(id);
    if (caso === null) throw new ErrorDeAplicacion('caso-inexistente');
    return aRespuesta(caso);
  }

  @Patch('casos/:id')
  @HttpCode(200)
  @ApiOperation({ operationId: 'editarCaso', summary: 'Edita un caso con la fecha de actualización que se leyó' })
  @DocumentarRutaDeAdmin({ mutacion: true })
  @respuestaDesdeZod(esquemaCasoAsistente, { description: 'El caso con los cambios y una fecha de actualización posterior.' })
  @respuestaProblema(400, 'El identificador o el cuerpo no cumplen el esquema (validacion-fallida).')
  @respuestaProblema(404, 'El caso o la categoría no existen (caso-inexistente, categoria-inexistente).')
  @respuestaProblema(409, 'Otro admin lo modificó, el título ya existe o es un caso del sistema que se quiso desactivar (caso-modificado, caso-duplicado, caso-del-sistema).')
  @respuestaProblema(422, 'El caso incumple las reglas de CAS5 (caso-invalido); el motivo va en `detail`.')
  async editarCaso(
    @Param('id', { schema: esquemaIdCaso }) id: string,
    @Body({ schema: esquemaEditarCaso }) cuerpo: EditarCasoCuerpo,
    @UsuarioActual() usuario: PerfilUsuario,
  ): Promise<CasoAsistenteRespuesta> {
    const resultado = await this.casos.editar(id, { ...cuerpo, actualizado: new Date(cuerpo.actualizado) });
    if (!resultado.ok) throw this.errorDeCaso(resultado);
    this.logger.log({ evento: 'asistente.caso-editado', casoId: id, usuarioId: usuario.id });
    return aRespuesta(resultado.caso);
  }

  @Delete('casos/:id')
  @HttpCode(204)
  @ApiOperation({ operationId: 'borrarCaso', summary: 'Borra un caso de intención' })
  @DocumentarRutaDeAdmin({ mutacion: true })
  @ApiNoContentResponse({ description: 'El caso se borró.' })
  @respuestaProblema(400, 'El identificador no cumple el esquema (validacion-fallida).')
  @respuestaProblema(404, 'El caso no existe (caso-inexistente).')
  @respuestaProblema(409, 'Un caso del sistema no se borra (caso-del-sistema).')
  async borrarCaso(@Param('id', { schema: esquemaIdCaso }) id: string, @UsuarioActual() usuario: PerfilUsuario): Promise<void> {
    const resultado = await this.casos.borrar(id);
    if (!resultado.ok) throw new ErrorDeAplicacion(resultado.razon === 'del-sistema' ? 'caso-del-sistema' : 'caso-inexistente');
    this.logger.log({ evento: 'asistente.caso-borrado', casoId: id, usuarioId: usuario.id });
  }

  // --- Traducción de resultados a errores de catálogo ---------------------------------------------------------------

  private errorDeCategoria(resultado: { readonly razon: 'duplicada' | 'inexistente' | 'invalida'; readonly motivo?: string }): ErrorDeAplicacion {
    if (resultado.razon === 'duplicada') return new ErrorDeAplicacion('categoria-duplicada');
    if (resultado.razon === 'inexistente') return new ErrorDeAplicacion('categoria-inexistente');
    return new ErrorDeAplicacion('categoria-invalida', { detalle: resultado.motivo ?? 'el nombre no cumple las reglas' });
  }

  private errorDeCaso(resultado: { readonly razon: string; readonly motivo?: string }): ErrorDeAplicacion {
    switch (resultado.razon) {
      case 'categoria-inexistente':
        return new ErrorDeAplicacion('categoria-inexistente');
      case 'duplicado':
        return new ErrorDeAplicacion('caso-duplicado');
      case 'inexistente':
        return new ErrorDeAplicacion('caso-inexistente');
      case 'modificado':
        return new ErrorDeAplicacion('caso-modificado');
      case 'del-sistema':
        return new ErrorDeAplicacion('caso-del-sistema');
      default:
        return new ErrorDeAplicacion('caso-invalido', { detalle: resultado.motivo ?? 'el caso no cumple las reglas' });
    }
  }
}
