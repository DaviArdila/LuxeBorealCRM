/**
 * Dominio puro de la configuración del negocio (CFG2-CFG4): valida cada grupo por su tipo y convierte el horario entre la
 * forma del formulario (un rango por día) y la que ya lee el módulo `horario` (siete claves explícitas en `jsonb`). Los
 * motivos nombran el campo y la regla, nunca el valor recibido (R14).
 */

export const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const;
export type Dia = (typeof DIAS)[number];

export interface RangoDelDia {
  readonly desde: string;
  readonly hasta: string;
}
export type Semana = Readonly<Record<Dia, RangoDelDia | null>>;

export interface ProblemaDeCampo {
  readonly campo: string;
  readonly problema: 'falta' | 'formato' | 'valor';
  /** Qué regla se rompió, para que la pantalla la muestre junto al campo. */
  readonly motivo: string;
}

export type Validacion<T> =
  | { readonly valido: true; readonly valor: T }
  | { readonly valido: false; readonly errores: readonly ProblemaDeCampo[]; readonly motivo: string };

function invalido(errores: readonly ProblemaDeCampo[]): { readonly valido: false; readonly errores: readonly ProblemaDeCampo[]; readonly motivo: string } {
  return { valido: false, errores, motivo: errores.map((e) => `${e.campo}: ${e.motivo}`).join('; ') };
}

// --- Horario (CFG2) -----------------------------------------------------------------------------------------------------

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `desde`-`hasta` por día, o `null` si el día está cerrado. Un rango que cruza la medianoche es válido (HOR6). */
export function validarSemana(semana: Semana): Validacion<Semana> {
  const errores: ProblemaDeCampo[] = [];
  for (const dia of DIAS) {
    const rango = semana[dia];
    if (rango === null) continue;
    const horasMalas = (['desde', 'hasta'] as const).filter((lado) => !HORA.test(rango[lado]));
    for (const lado of horasMalas) {
      errores.push({ campo: `dias.${dia}.${lado}`, problema: 'formato', motivo: `la hora de «${dia}» debe ser HH:MM entre 00:00 y 23:59` });
    }
    if (horasMalas.length === 0 && rango.desde === rango.hasta) {
      errores.push({ campo: `dias.${dia}.hasta`, problema: 'valor', motivo: `«${dia}» abre y cierra a la misma hora; márcalo cerrado o corrige el rango` });
    }
  }
  return errores.length === 0 ? { valido: true, valor: semana } : invalido(errores);
}

/** La forma que guarda `parametro.horario_atencion`: siete claves, `"HH:MM-HH:MM"` o `null`. */
export function serializarSemana(semana: Semana): Record<Dia, string | null> {
  const valor = {} as Record<Dia, string | null>;
  for (const dia of DIAS) {
    const rango = semana[dia];
    valor[dia] = rango === null ? null : `${rango.desde}-${rango.hasta}`;
  }
  return valor;
}

/** Lee lo guardado para mostrarlo; un día ausente o ilegible se ve cerrado, nunca lanza. */
export function leerSemana(valorCrudo: unknown): Semana {
  const objeto = typeof valorCrudo === 'object' && valorCrudo !== null && !Array.isArray(valorCrudo) ? (valorCrudo as Record<string, unknown>) : {};
  const semana = {} as Record<Dia, RangoDelDia | null>;
  for (const dia of DIAS) {
    const texto = objeto[dia];
    const partes = typeof texto === 'string' ? texto.split('-') : [];
    const [desde, hasta] = partes;
    semana[dia] = partes.length === 2 && desde !== undefined && hasta !== undefined && HORA.test(desde) && HORA.test(hasta) ? { desde, hasta } : null;
  }
  return semana;
}

export const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Una fecha `AAAA-MM-DD` que existe en el calendario. */
export function esFechaValida(fecha: string): boolean {
  if (!FORMATO_FECHA.test(fecha)) return false;
  const instante = new Date(`${fecha}T00:00:00.000Z`);
  return !Number.isNaN(instante.getTime()) && instante.toISOString().startsWith(fecha);
}

// --- Envíos (CFG3) ------------------------------------------------------------------------------------------------------

export interface ConfiguracionEnvios {
  readonly recargoContraentregaPct: number;
  readonly factorVolumetrico: number;
}

export const RECARGO_POR_DEFECTO_PCT = 5;
export const FACTOR_POR_DEFECTO = 4000;
export const MAXIMO_FACTOR_VOLUMETRICO = 100_000;

export function esRecargoValido(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor <= 100 && Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-9;
}

export function esFactorValido(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor > 0 && valor <= MAXIMO_FACTOR_VOLUMETRICO;
}

export function validarEnvios(entrada: ConfiguracionEnvios): Validacion<ConfiguracionEnvios> {
  const errores: ProblemaDeCampo[] = [];
  if (!esRecargoValido(entrada.recargoContraentregaPct)) {
    errores.push({ campo: 'recargoContraentregaPct', problema: 'valor', motivo: 'el recargo debe estar entre 0 y 100 con hasta dos decimales' });
  }
  if (!esFactorValido(entrada.factorVolumetrico)) {
    errores.push({ campo: 'factorVolumetrico', problema: 'valor', motivo: `el factor volumétrico debe ser un entero positivo de hasta ${String(MAXIMO_FACTOR_VOLUMETRICO)}` });
  }
  return errores.length === 0 ? { valido: true, valor: entrada } : invalido(errores);
}

// --- Gasto del LLM (CFG4) -----------------------------------------------------------------------------------------------

export interface ConfiguracionGastoLlm {
  readonly techoMensualUsd: number;
}

export const MAXIMO_TECHO_USD = 10_000;

export function esTechoValido(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0 && valor <= MAXIMO_TECHO_USD;
}

export function validarGastoLlm(entrada: ConfiguracionGastoLlm): Validacion<ConfiguracionGastoLlm> {
  return esTechoValido(entrada.techoMensualUsd)
    ? { valido: true, valor: entrada }
    : invalido([{ campo: 'techoMensualUsd', problema: 'valor', motivo: `el techo debe ser mayor que 0 y de hasta ${String(MAXIMO_TECHO_USD)} USD` }]);
}
