import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK } from '../../../plataforma/reloj/index.js';
import type { Clock } from '../../../plataforma/reloj/index.js';
import {
  esFactorValido,
  esFechaValida,
  esRecargoValido,
  esTechoValido,
  FACTOR_POR_DEFECTO,
  leerSemana,
  RECARGO_POR_DEFECTO_PCT,
  serializarSemana,
  validarEnvios,
  validarGastoLlm,
  validarSemana,
  type ConfiguracionEnvios,
  type ConfiguracionGastoLlm,
  type ProblemaDeCampo,
  type Semana,
} from '../dominio/configuracion.js';
import { INVALIDADOR_DE_CACHES, type InvalidadorDeCaches } from '../puertos/invalidador-caches.js';
import { REPOSITORIO_CONFIGURACION, type ExcepcionDeHorario, type RepositorioConfiguracion } from '../puertos/repositorio-configuracion.js';

export type Guardado =
  | { readonly ok: true; readonly cambios: readonly string[] }
  | { readonly ok: false; readonly errores: readonly ProblemaDeCampo[]; readonly motivo: string };

export interface HorarioConfigurado {
  readonly dias: Semana;
  readonly excepciones: readonly ExcepcionDeHorario[];
  readonly actualizado: Date | null;
}

export interface EnviosConfigurados extends ConfiguracionEnvios {
  readonly actualizado: Date | null;
}

/** Lo que el gateway guarda del techo; la escritura de la API nunca lo toca (CFG4). */
export interface EstadoDelTecho {
  readonly mes: string;
  readonly avisoEmitido: boolean;
  readonly bloqueado: boolean;
}

export interface GastoLlmConfigurado {
  readonly techoMensualUsd: number | null;
  readonly estado: EstadoDelTecho | null;
  readonly gastoMesUsd: number | null;
  readonly actualizado: Date | null;
}

export type ResultadoExcepcion =
  | { readonly ok: true }
  | { readonly ok: false; readonly razon: 'duplicada' }
  | { readonly ok: false; readonly razon: 'invalida'; readonly motivo: string };

const MAXIMO_MOTIVO = 200;

function masReciente(...fechas: readonly (Date | undefined)[]): Date | null {
  const validas = fechas.filter((f): f is Date => f !== undefined);
  return validas.length === 0 ? null : new Date(Math.max(...validas.map((f) => f.getTime())));
}

function estadoDe(valor: unknown): { readonly estado: EstadoDelTecho; readonly gastoUsd: number } | null {
  if (typeof valor !== 'object' || valor === null) return null;
  const c = valor as Record<string, unknown>;
  if (typeof c['mes'] !== 'string' || typeof c['gastoUsd'] !== 'number' || typeof c['avisoEmitido'] !== 'boolean' || typeof c['bloqueado'] !== 'boolean') return null;
  return { estado: { mes: c['mes'], avisoEmitido: c['avisoEmitido'], bloqueado: c['bloqueado'] }, gastoUsd: c['gastoUsd'] };
}

/**
 * Los tres grupos de configuración del negocio (CFG1-CFG6): validan por tipo, escriben solo claves del registro y, al
 * guardar, hacen efectivo el cambio en el siguiente mensaje (CFG5). Nunca recibe ni loguea el cuerpo completo (R14): devuelve
 * los nombres de los campos que cambiaron para que el controlador los registre.
 */
@Injectable()
export class AdministrarConfiguracion {
  private readonly logger = new Logger(AdministrarConfiguracion.name);

  constructor(
    @Inject(REPOSITORIO_CONFIGURACION) private readonly repositorio: RepositorioConfiguracion,
    @Inject(INVALIDADOR_DE_CACHES) private readonly caches: InvalidadorDeCaches,
    @Inject(CLOCK) private readonly reloj: Clock,
  ) {}

  // --- Horario (CFG2) ---------------------------------------------------------------------------------------------------

  async obtenerHorario(): Promise<HorarioConfigurado> {
    const [guardado, excepciones] = await Promise.all([this.repositorio.leerParametro('horario_atencion'), this.repositorio.listarExcepciones()]);
    return { dias: leerSemana(guardado?.valor), excepciones, actualizado: guardado?.actualizado ?? null };
  }

  async guardarHorario(dias: Semana): Promise<Guardado> {
    const validacion = validarSemana(dias);
    if (!validacion.valido) return { ok: false, errores: validacion.errores, motivo: validacion.motivo };
    const anterior = leerSemana((await this.repositorio.leerParametro('horario_atencion'))?.valor);
    await this.repositorio.guardarParametros([{ clave: 'horario_atencion', valor: serializarSemana(dias) }], this.reloj.ahora());
    const cambios = Object.keys(dias).filter((dia) => JSON.stringify(anterior[dia as keyof Semana]) !== JSON.stringify(dias[dia as keyof Semana]));
    return { ok: true, cambios };
  }

  async crearExcepcion(fecha: string, motivo: string | null): Promise<ResultadoExcepcion> {
    if (!esFechaValida(fecha)) return { ok: false, razon: 'invalida', motivo: 'la fecha debe existir y venir como AAAA-MM-DD' };
    const limpio = motivo?.trim() ?? '';
    if (limpio.length > MAXIMO_MOTIVO) return { ok: false, razon: 'invalida', motivo: `el motivo supera ${String(MAXIMO_MOTIVO)} caracteres` };
    return (await this.repositorio.crearExcepcion(fecha, limpio === '' ? null : limpio)) ? { ok: true } : { ok: false, razon: 'duplicada' };
  }

  async borrarExcepcion(fecha: string): Promise<boolean> {
    return this.repositorio.borrarExcepcion(fecha);
  }

  // --- Envíos (CFG3) ----------------------------------------------------------------------------------------------------

  async obtenerEnvios(): Promise<EnviosConfigurados> {
    const [recargo, factor] = await Promise.all([this.repositorio.leerParametro('recargo_contraentrega_pct'), this.repositorio.leerParametro('factor_volumetrico')]);
    return {
      recargoContraentregaPct: esRecargoValido(recargo?.valor) ? recargo.valor : RECARGO_POR_DEFECTO_PCT,
      factorVolumetrico: esFactorValido(factor?.valor) ? factor.valor : FACTOR_POR_DEFECTO,
      actualizado: masReciente(recargo?.actualizado, factor?.actualizado),
    };
  }

  async guardarEnvios(entrada: ConfiguracionEnvios): Promise<Guardado> {
    const validacion = validarEnvios(entrada);
    if (!validacion.valido) return { ok: false, errores: validacion.errores, motivo: validacion.motivo };
    const anterior = await this.obtenerEnvios();
    await this.repositorio.guardarParametros(
      [
        { clave: 'recargo_contraentrega_pct', valor: entrada.recargoContraentregaPct },
        { clave: 'factor_volumetrico', valor: entrada.factorVolumetrico },
      ],
      this.reloj.ahora(),
    );
    await this.invalidarCatalogo();
    const cambios = (['recargoContraentregaPct', 'factorVolumetrico'] as const).filter((campo) => anterior[campo] !== entrada[campo] || anterior.actualizado === null);
    return { ok: true, cambios };
  }

  /** CFG5: la escritura ya está confirmada; si la invalidación falla se avisa sin valores y la copia caduca por su TTL. */
  private async invalidarCatalogo(): Promise<void> {
    try {
      await this.caches.invalidarCatalogo();
    } catch {
      this.logger.warn({ evento: 'configuracion.invalidacion-fallida', grupo: 'envios' });
    }
  }

  // --- Gasto del LLM (CFG4) ---------------------------------------------------------------------------------------------

  async obtenerGastoLlm(): Promise<GastoLlmConfigurado> {
    const [techo, estado] = await Promise.all([this.repositorio.leerParametro('llm_techo_mensual_usd'), this.repositorio.leerParametro('llm_estado_techo')]);
    const leido = estadoDe(estado?.valor);
    return {
      techoMensualUsd: esTechoValido(techo?.valor) ? techo.valor : null,
      estado: leido?.estado ?? null,
      gastoMesUsd: leido?.gastoUsd ?? null,
      actualizado: techo?.actualizado ?? null,
    };
  }

  async guardarGastoLlm(entrada: ConfiguracionGastoLlm): Promise<Guardado> {
    const validacion = validarGastoLlm(entrada);
    if (!validacion.valido) return { ok: false, errores: validacion.errores, motivo: validacion.motivo };
    const anterior = (await this.repositorio.leerParametro('llm_techo_mensual_usd'))?.valor;
    await this.repositorio.guardarParametros([{ clave: 'llm_techo_mensual_usd', valor: entrada.techoMensualUsd }], this.reloj.ahora());
    return { ok: true, cambios: anterior === entrada.techoMensualUsd ? [] : ['techoMensualUsd'] };
  }
}
