import type { CandidataExclusion, CandidataTarifa } from '../dominio/envio.js';

/** Token de inyección del puerto {@link RepositorioEnvio} (design.md, "Puertos y adaptadores"). */
export const REPOSITORIO_ENVIO = Symbol('REPOSITORIO_ENVIO');

/**
 * Datos para registrar un evento fuera de cobertura (CAT9). `departamentoId`/`ciudadId` quedan
 * siempre en `null` en esta fase (D7): traducir el texto libre del cliente a un código DANE
 * necesitaría búsqueda difusa de lugares, capacidad que no existe todavía en ningún módulo.
 */
export interface NuevoEventoFueraCobertura {
  readonly productoId: string | null;
  readonly departamentoTexto: string;
  readonly ciudadTexto: string | null;
  readonly departamentoId: null;
  readonly ciudadId: null;
}

/**
 * Puerto de acceso a `tarifa_estimada`, `zona_sin_cobertura` y `evento_fuera_cobertura`
 * (design.md, tabla "Puertos y adaptadores"). `listarExclusiones`/`listarTarifas` devuelven los
 * nombres de departamento/ciudad ya resueltos (D1): el dominio (`elegirTarifa`, `hayExclusion`)
 * compara por nombre normalizado, nunca por código DANE.
 */
export interface RepositorioEnvio {
  listarExclusiones(): Promise<readonly CandidataExclusion[]>;
  listarTarifas(): Promise<readonly CandidataTarifa[]>;
  registrarEventoFueraCobertura(evento: NuevoEventoFueraCobertura): Promise<void>;
}
