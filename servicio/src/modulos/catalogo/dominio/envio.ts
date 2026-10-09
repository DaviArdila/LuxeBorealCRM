/**
 * Dominio puro de envío: peso facturable, exclusión de cobertura y elección de tarifa por
 * especificidad (D1, D3, D6). Portado de `../ChatLuxeCRM/src/envios/calculo.ts` sin cambiar su
 * comportamiento, generalizado a los tipos de dominio de esta fase (`CandidataTarifa`,
 * `CandidataExclusion`) y a la comparación por nombre normalizado en vez de por código DANE (D1:
 * `catalogo` no depende de `modulos/geografia`). Sin imports de NestJS/Prisma — regla
 * `dominio-aislado`: solo `compartido/texto` (comparación de nombres) y `compartido/dinero`
 * (formateo de la cotización, D6).
 */

import { formatearDias, formatearRangoCop } from '../../../compartido/dinero/index.js';
import { normalizarLugar } from '../../../compartido/texto/index.js';

export interface LineaPeso {
  readonly cantidad: number;
  readonly pesoGramos: number | null;
  readonly largoMm: number | null;
  readonly anchoMm: number | null;
  readonly altoMm: number | null;
}

export interface DestinoEnvio {
  readonly departamento: string;
  readonly ciudad?: string | null;
}

/** Factor volumétrico por defecto (cm³ por kg facturable) cuando el parámetro falta o es inválido. */
export const FACTOR_VOLUMETRICO_POR_DEFECTO = 4000;

/** Σ cantidad × peso real. Un producto sin peso registrado cuenta 0. */
function pesoRealG(lineas: readonly LineaPeso[]): number {
  return lineas.reduce((acumulado, linea) => acumulado + linea.cantidad * (linea.pesoGramos ?? 0), 0);
}

/** Σ cantidad × (largo × ancho × alto) / factor. Con milímetros y factor 4000 da gramos. */
function pesoVolumetricoG(lineas: readonly LineaPeso[], factorVolumetrico: number): number {
  return lineas.reduce((acumulado, linea) => {
    if (linea.largoMm == null || linea.anchoMm == null || linea.altoMm == null) return acumulado;
    return acumulado + (linea.cantidad * linea.largoMm * linea.anchoMm * linea.altoMm) / factorVolumetrico;
  }, 0);
}

/** Lo que cobra la transportadora: el mayor entre peso real y volumétrico, en gramos enteros (CAT6). */
export function pesoFacturableG(lineas: readonly LineaPeso[], factorVolumetrico: number): number {
  return Math.ceil(Math.max(pesoRealG(lineas), pesoVolumetricoG(lineas, factorVolumetrico)));
}

/**
 * Valida la forma del parámetro `factor_volumetrico` (R15: dato del negocio, no constante). Un
 * valor crudo que no sea un número positivo y finito cae al valor por defecto sin fallar.
 */
export function validarFactorVolumetrico(valorCrudo: unknown): number {
  return typeof valorCrudo === 'number' && Number.isFinite(valorCrudo) && valorCrudo > 0
    ? valorCrudo
    : FACTOR_VOLUMETRICO_POR_DEFECTO;
}

export interface CandidataTarifa {
  readonly id: string;
  readonly departamentoNombre: string | null; // null = nacional
  readonly ciudadNombre: string | null; // null = tarifa por defecto del departamento
  readonly pesoMinG: number;
  readonly pesoMaxG: number | null;
  readonly rangoMinCop: number;
  readonly rangoMaxCop: number;
  readonly diasMin: number;
  readonly diasMax: number;
  readonly contraentregaDisponible: boolean;
  readonly creado: Date;
}

export interface CandidataExclusion {
  readonly departamentoNombre: string;
  readonly ciudadNombre: string | null; // null = todo el departamento
}

/** Cobertura excluida tiene prioridad sobre cualquier tarifa (CAT7): se comprueba antes que elegirTarifa. */
export function hayExclusion(exclusiones: readonly CandidataExclusion[], destino: DestinoEnvio): boolean {
  const departamentoDestino = normalizarLugar(destino.departamento);
  const ciudadDestino = destino.ciudad ? normalizarLugar(destino.ciudad) : null;

  return exclusiones.some((exclusion) => {
    if (normalizarLugar(exclusion.departamentoNombre) !== departamentoDestino) return false;
    if (exclusion.ciudadNombre === null) return true; // todo el departamento excluido
    return ciudadDestino !== null && normalizarLugar(exclusion.ciudadNombre) === ciudadDestino;
  });
}

function cubrePeso(tarifa: CandidataTarifa, pesoFacturableGramos: number): boolean {
  return tarifa.pesoMinG <= pesoFacturableGramos && (tarifa.pesoMaxG === null || pesoFacturableGramos <= tarifa.pesoMaxG);
}

/**
 * Desempate D3 dentro de un mismo nivel de especificidad: gana la franja de peso más angosta
 * (`pesoMaxG` nulo cuenta como infinita); si sigue empatada, la fila `creado` más antigua.
 */
function elegirPorFranjaMasAngosta(candidatas: readonly CandidataTarifa[]): CandidataTarifa | undefined {
  if (candidatas.length === 0) return undefined;

  return [...candidatas].sort((a, b) => {
    const anchoA = (a.pesoMaxG ?? Infinity) - a.pesoMinG;
    const anchoB = (b.pesoMaxG ?? Infinity) - b.pesoMinG;
    if (anchoA !== anchoB) return anchoA - anchoB;
    return a.creado.getTime() - b.creado.getTime();
  })[0];
}

/**
 * Elige, entre las candidatas cuya franja de peso cubre el peso facturable, la más específica:
 * ciudad exacta → tarifa por defecto del departamento → nacional (CAT8). Como respaldo, si el
 * departamento pedido no tiene ninguna candidata (ciudad-distrito registrada bajo otro
 * departamento, ej. "Cundinamarca"/"Bogotá"), se intenta resolver por el nombre de la ciudad sola
 * (D1: comparación por nombre normalizado, nunca por código DANE).
 */
export function elegirTarifa(
  candidatas: readonly CandidataTarifa[],
  destino: DestinoEnvio,
  pesoFacturableG: number,
): CandidataTarifa | undefined {
  const departamentoDestino = normalizarLugar(destino.departamento);
  const ciudadDestino = destino.ciudad ? normalizarLugar(destino.ciudad) : null;

  const deDepartamento = candidatas.filter(
    (tarifa) => tarifa.departamentoNombre !== null && normalizarLugar(tarifa.departamentoNombre) === departamentoDestino,
  );
  const porCiudad = ciudadDestino
    ? deDepartamento.filter((tarifa) => tarifa.ciudadNombre !== null && normalizarLugar(tarifa.ciudadNombre) === ciudadDestino)
    : [];
  const porDefectoDepartamento = deDepartamento.filter((tarifa) => tarifa.ciudadNombre === null);
  const nacional = candidatas.filter((tarifa) => tarifa.departamentoNombre === null);

  const elegirEntre = (lista: readonly CandidataTarifa[]) =>
    elegirPorFranjaMasAngosta(lista.filter((tarifa) => cubrePeso(tarifa, pesoFacturableG)));

  return (
    elegirEntre(porCiudad) ??
    elegirEntre(porDefectoDepartamento) ??
    elegirEntre(nacional) ??
    (ciudadDestino
      ? elegirEntre(
          candidatas.filter(
            (tarifa) =>
              (tarifa.ciudadNombre !== null && normalizarLugar(tarifa.ciudadNombre) === ciudadDestino) ||
              (tarifa.ciudadNombre === null &&
                tarifa.departamentoNombre !== null &&
                normalizarLugar(tarifa.departamentoNombre).startsWith(ciudadDestino)),
          ),
        )
      : undefined)
  );
}

export type ResultadoCotizacion =
  | { readonly cobertura: true; readonly rangoTexto: string; readonly diasTexto: string; readonly contraentregaDisponible: boolean }
  | { readonly cobertura: false };

/**
 * Arma la cotización con cobertura a partir de una tarifa ya elegida (CAT10, D6): rango y días ya
 * formateados con `compartido/dinero`, sin que el LLM (Fase 07) tenga que calcular nada (R2). La
 * rama `cobertura: false` de `ResultadoCotizacion` la construye el servicio de aplicación
 * `CotizarEnvio` (T8), no esta función de dominio.
 */
export function armarCotizacionConCobertura(tarifa: CandidataTarifa): Extract<ResultadoCotizacion, { cobertura: true }> {
  return {
    cobertura: true,
    rangoTexto: formatearRangoCop(tarifa.rangoMinCop, tarifa.rangoMaxCop),
    diasTexto: formatearDias(tarifa.diasMin, tarifa.diasMax),
    contraentregaDisponible: tarifa.contraentregaDisponible,
  };
}
