import type { CatalogoGeografico, Ciudad, Departamento } from '../dominio/geografia.js';

/** Token de inyección del puerto {@link RepositorioGeografia} (design.md D8). */
export const REPOSITORIO_GEOGRAFIA = Symbol('REPOSITORIO_GEOGRAFIA');

/** Conteo de filas de un tipo de objeto tras `guardarCatalogo` (design.md D8). */
export interface ConteoGuardado {
  readonly insertados: number;
  readonly actualizados: number;
  readonly sinCambios: number;
}

/** Resumen completo devuelto por `guardarCatalogo`, por tipo de objeto guardado. */
export interface ResumenGuardado {
  readonly departamentos: ConteoGuardado;
  readonly ciudades: ConteoGuardado;
}

/**
 * Puerto de acceso al catálogo geográfico DANE (`departamento`, `ciudad`). Solo lectura salvo
 * `guardarCatalogo`, que usa la semilla DANE (T4); ningún caso de uso de negocio escribe aquí.
 */
export interface RepositorioGeografia {
  /** Upsert por código DANE en una transacción; nunca borra una fila existente (D8, PER13). */
  guardarCatalogo(catalogo: CatalogoGeografico): Promise<ResumenGuardado>;
  /** Ordenado por `id` ascendente (PER13). */
  listarDepartamentos(): Promise<readonly Departamento[]>;
  /** Ordenado por `id` ascendente, filtrado por departamento (PER13). */
  listarCiudadesDe(departamentoId: string): Promise<readonly Ciudad[]>;
}
