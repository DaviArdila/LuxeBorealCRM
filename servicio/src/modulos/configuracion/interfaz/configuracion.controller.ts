import { Body, Controller, Delete, Get, HttpCode, Logger, Param, Post, Put } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation } from '@nestjs/swagger';
import { respuestaDesdeZod, respuestaProblema } from '../../../plataforma/documentacion/index.js';
import { ErrorDeAplicacion } from '../../../plataforma/errores/index.js';
import { DocumentarRutaDeAdmin, Roles, UsuarioActual, type PerfilUsuario } from '../../usuarios/index.js';
import { AdministrarConfiguracion, type Guardado } from '../aplicacion/administrar-configuracion.js';
import {
  esquemaCrearExcepcion,
  esquemaEnvios,
  esquemaFechaExcepcion,
  esquemaGastoLlm,
  esquemaGuardarEnvios,
  esquemaGuardarGastoLlm,
  esquemaGuardarHorario,
  esquemaExcepcion,
  esquemaHorario,
  type CrearExcepcionCuerpo,
  type EnviosRespuesta,
  type GastoLlmRespuesta,
  type GuardarEnviosCuerpo,
  type GuardarGastoLlmCuerpo,
  type GuardarHorarioCuerpo,
  type HorarioRespuesta,
} from './esquemas-configuracion.js';

const CAMPOS_ENVIOS = ['recargoContraentregaPct', 'factorVolumetrico'];
const CAMPOS_GASTO = ['techoMensualUsd'];
const CAMPOS_HORARIO = ['dias'];

/** Un campo que el cuerpo trae de más (p. ej. el estado del techo) es un `422` que lo nombra, sin tocar nada (CFG4). */
function rechazarCamposDeMas(cuerpo: object, permitidos: readonly string[]): void {
  const demas = Object.keys(cuerpo).filter((campo) => !permitidos.includes(campo));
  if (demas.length === 0) return;
  throw new ErrorDeAplicacion('configuracion-invalida', {
    errores: demas.map((campo) => ({ campo, problema: 'formato' as const })),
    detalle: `campos que no se pueden escribir: ${demas.join(', ')}`,
  });
}

function exigirGuardado(resultado: Guardado): readonly string[] {
  if (resultado.ok) return resultado.cambios;
  throw new ErrorDeAplicacion('configuracion-invalida', {
    errores: resultado.errores.map(({ campo, problema }) => ({ campo, problema })),
    detalle: resultado.motivo,
  });
}

/**
 * Configuración del negocio por grupos tipados (CFG1-CFG5), solo para `admin` (API7). Los logs de una escritura llevan el
 * grupo, el usuario y los **nombres** de los campos que cambiaron, nunca el cuerpo ni sus valores (R14).
 */
@Controller('configuracion')
@Roles('admin')
export class ConfiguracionController {
  private readonly logger = new Logger(ConfiguracionController.name);

  constructor(private readonly configuracion: AdministrarConfiguracion) {}

  private registrar(grupo: string, usuario: PerfilUsuario, campos: readonly string[]): void {
    this.logger.log({ evento: 'configuracion.guardada', grupo, usuarioId: usuario.id, campos });
  }

  // --- Horario --------------------------------------------------------------------------------------------------------

  @Get('horario')
  @ApiOperation({ operationId: 'obtenerHorario', summary: 'Lee el horario de atención por día y sus excepciones' })
  @DocumentarRutaDeAdmin({ mutacion: false })
  @respuestaDesdeZod(esquemaHorario, { description: 'El rango de cada día (o nulo si está cerrado) y las excepciones por fecha.' })
  async obtenerHorario(): Promise<HorarioRespuesta> {
    const horario = await this.configuracion.obtenerHorario();
    return { dias: { ...horario.dias }, excepciones: [...horario.excepciones], actualizado: horario.actualizado?.toISOString() ?? null };
  }

  @Put('horario')
  @HttpCode(200)
  @ApiOperation({ operationId: 'guardarHorario', summary: 'Guarda el horario de atención de los siete días' })
  @DocumentarRutaDeAdmin({ mutacion: true })
  @respuestaDesdeZod(esquemaHorario, { description: 'El horario guardado, con sus excepciones.' })
  @respuestaProblema(400, 'El cuerpo no cumple el esquema (validacion-fallida).')
  @respuestaProblema(422, 'Una hora o un rango no es válido; el motivo nombra el día (configuracion-invalida).')
  async guardarHorario(@Body({ schema: esquemaGuardarHorario }) cuerpo: GuardarHorarioCuerpo, @UsuarioActual() usuario: PerfilUsuario): Promise<HorarioRespuesta> {
    rechazarCamposDeMas(cuerpo, CAMPOS_HORARIO);
    this.registrar('horario', usuario, exigirGuardado(await this.configuracion.guardarHorario(cuerpo.dias)));
    return this.obtenerHorario();
  }

  @Post('horario/excepciones')
  @HttpCode(201)
  @ApiOperation({ operationId: 'crearExcepcionHorario', summary: 'Crea una excepción de horario (un día cerrado) para una fecha' })
  @DocumentarRutaDeAdmin({ mutacion: true })
  @respuestaDesdeZod(esquemaExcepcion, { description: 'La excepción creada.', status: 201 })
  @respuestaProblema(400, 'El cuerpo no cumple el esquema (validacion-fallida).')
  @respuestaProblema(409, 'Ya existe una excepción para esa fecha (excepcion-duplicada).')
  @respuestaProblema(422, 'La fecha o el motivo no son válidos (configuracion-invalida).')
  async crearExcepcionHorario(@Body({ schema: esquemaCrearExcepcion }) cuerpo: CrearExcepcionCuerpo, @UsuarioActual() usuario: PerfilUsuario): Promise<{ fecha: string; motivo: string | null }> {
    const resultado = await this.configuracion.crearExcepcion(cuerpo.fecha, cuerpo.motivo ?? null);
    if (!resultado.ok) {
      if (resultado.razon === 'duplicada') throw new ErrorDeAplicacion('excepcion-duplicada');
      throw new ErrorDeAplicacion('configuracion-invalida', { errores: [{ campo: 'fecha', problema: 'formato' }], detalle: resultado.motivo });
    }
    this.registrar('horario', usuario, ['excepciones']);
    const creada = (await this.configuracion.obtenerHorario()).excepciones.find((e) => e.fecha === cuerpo.fecha);
    return { fecha: cuerpo.fecha, motivo: creada?.motivo ?? null };
  }

  @Delete('horario/excepciones/:fecha')
  @HttpCode(204)
  @ApiOperation({ operationId: 'borrarExcepcionHorario', summary: 'Borra la excepción de horario de una fecha (AAAA-MM-DD)' })
  @DocumentarRutaDeAdmin({ mutacion: true })
  @ApiNoContentResponse({ description: 'La excepción se borró.' })
  @respuestaProblema(404, 'No hay una excepción para esa fecha (excepcion-inexistente).')
  async borrarExcepcionHorario(@Param('fecha', { schema: esquemaFechaExcepcion }) fecha: string, @UsuarioActual() usuario: PerfilUsuario): Promise<void> {
    if (!(await this.configuracion.borrarExcepcion(fecha))) throw new ErrorDeAplicacion('excepcion-inexistente');
    this.registrar('horario', usuario, ['excepciones']);
  }

  // --- Envíos ---------------------------------------------------------------------------------------------------------

  @Get('envios')
  @ApiOperation({ operationId: 'obtenerConfiguracionEnvios', summary: 'Lee el recargo de contra entrega y el factor volumétrico' })
  @DocumentarRutaDeAdmin({ mutacion: false })
  @respuestaDesdeZod(esquemaEnvios, { description: 'Los valores vigentes (o los de respaldo si no se han guardado) y su fecha de actualización.' })
  async obtenerConfiguracionEnvios(): Promise<EnviosRespuesta> {
    const envios = await this.configuracion.obtenerEnvios();
    return { ...envios, actualizado: envios.actualizado?.toISOString() ?? null };
  }

  @Put('envios')
  @HttpCode(200)
  @ApiOperation({ operationId: 'guardarConfiguracionEnvios', summary: 'Guarda el recargo de contra entrega y el factor volumétrico' })
  @DocumentarRutaDeAdmin({ mutacion: true })
  @respuestaDesdeZod(esquemaEnvios, { description: 'Los valores guardados; rigen desde el siguiente mensaje.' })
  @respuestaProblema(400, 'El cuerpo no cumple el esquema (validacion-fallida).')
  @respuestaProblema(422, 'Un valor está fuera de rango; el motivo nombra el campo (configuracion-invalida).')
  async guardarConfiguracionEnvios(@Body({ schema: esquemaGuardarEnvios }) cuerpo: GuardarEnviosCuerpo, @UsuarioActual() usuario: PerfilUsuario): Promise<EnviosRespuesta> {
    rechazarCamposDeMas(cuerpo, CAMPOS_ENVIOS);
    this.registrar('envios', usuario, exigirGuardado(await this.configuracion.guardarEnvios(cuerpo)));
    return this.obtenerConfiguracionEnvios();
  }

  // --- Gasto del LLM --------------------------------------------------------------------------------------------------

  @Get('gasto-llm')
  @ApiOperation({ operationId: 'obtenerGastoLlm', summary: 'Lee el techo mensual del LLM, su estado y el gasto del mes' })
  @DocumentarRutaDeAdmin({ mutacion: false })
  @respuestaDesdeZod(esquemaGastoLlm, { description: 'El techo guardado (nulo si rige el del entorno), el estado del gateway y el gasto del mes.' })
  async obtenerGastoLlm(): Promise<GastoLlmRespuesta> {
    const gasto = await this.configuracion.obtenerGastoLlm();
    return { ...gasto, actualizado: gasto.actualizado?.toISOString() ?? null };
  }

  @Put('gasto-llm')
  @HttpCode(200)
  @ApiOperation({ operationId: 'guardarGastoLlm', summary: 'Guarda el techo mensual de gasto del LLM' })
  @DocumentarRutaDeAdmin({ mutacion: true })
  @respuestaDesdeZod(esquemaGastoLlm, { description: 'El techo guardado; rige desde la siguiente solicitud al LLM.' })
  @respuestaProblema(400, 'El cuerpo no cumple el esquema (validacion-fallida).')
  @respuestaProblema(422, 'El techo no es válido o el cuerpo trae un campo que no se escribe (configuracion-invalida).')
  async guardarGastoLlm(@Body({ schema: esquemaGuardarGastoLlm }) cuerpo: GuardarGastoLlmCuerpo, @UsuarioActual() usuario: PerfilUsuario): Promise<GastoLlmRespuesta> {
    rechazarCamposDeMas(cuerpo, CAMPOS_GASTO);
    this.registrar('gasto-llm', usuario, exigirGuardado(await this.configuracion.guardarGastoLlm(cuerpo)));
    return this.obtenerGastoLlm();
  }
}
