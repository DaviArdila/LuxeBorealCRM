import type { UsoReportado } from './tipos-llm.js';

/** USD por millón de tokens (R15: viene de configuración, nunca del LLM — R2). */
export interface PrecioModelo {
  readonly entrada: number;
  readonly salida: number;
  readonly cache: number;
}

const MICRO_USD_POR_USD = 1_000_000;
const TOKENS_POR_MILLON = 1_000_000;

function precioAMicroUsd(usdPorMillon: number): number {
  return Math.round(usdPorMillon * MICRO_USD_POR_USD);
}

// Solo enteros hasta el redondeo final: una suma de floats haría deriva en el techo de gasto (R13).
export function calcularCostoEstimado(uso: UsoReportado, precio: PrecioModelo): number {
  const sumaMicroUsdPorMillon =
    uso.tokensEntrada * precioAMicroUsd(precio.entrada) +
    uso.tokensSalida * precioAMicroUsd(precio.salida) +
    uso.tokensCache * precioAMicroUsd(precio.cache);
  return Math.floor((sumaMicroUsdPorMillon + TOKENS_POR_MILLON / 2) / TOKENS_POR_MILLON);
}

export function microUsdAUsd(microUsd: number): number {
  return microUsd / MICRO_USD_POR_USD;
}

// Mes en UTC (D7): determinista con `ClockFalso`; el desfase con Bogotá es inmaterial para el techo.
export function inicioMesUTC(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), 1));
}
