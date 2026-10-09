import type { DefinicionHerramienta } from '../../llm/index.js';
import type { EfectoTurno } from './efectos.js';

/** Sesión bot del turno: conversación + versión (D8 de la Fase 07a). */
export interface SesionHerramienta {
  readonly conversacionId: string;
  readonly version: number;
}

/**
 * Lo que una herramienta puede saber del turno. El contacto sale del contexto de la conversación,
 * nunca de los argumentos del modelo (matriz de amenazas); `efectosPrevios` es de solo lectura, sin
 * estado mutable compartido (A4).
 */
export interface ContextoHerramienta {
  readonly sesion: SesionHerramienta;
  readonly contactoId: string;
  readonly efectosPrevios: readonly EfectoTurno[];
}

export interface ResultadoHerramientaAgente {
  /** Lo que ve el modelo: datos ya formateados, listos para citar (R1, R2). */
  readonly paraElModelo: unknown;
  readonly efectos: readonly EfectoTurno[];
}

/**
 * Una de las ocho herramientas del agente (R1). Envuelve un caso de uso de otro módulo; el bucle
 * solo la conoce por su `definicion.nombre`.
 */
export interface Herramienta {
  readonly definicion: DefinicionHerramienta;
  ejecutar(argumentos: unknown, ctx: ContextoHerramienta): Promise<ResultadoHerramientaAgente>;
}

/** Token de la lista de herramientas registradas (D1). */
export const HERRAMIENTAS_AGENTE = Symbol('HERRAMIENTAS_AGENTE');
