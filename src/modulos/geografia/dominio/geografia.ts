/**
 * Tipos de dominio del catálogo geográfico DANE (design.md D8) y reglas puras de forma de sus
 * códigos, reutilizadas por el intérprete de la semilla (`interpretar-divipola.ts`, T4) y por el
 * repositorio (`infraestructura/repositorio-geografia-prisma.ts`). Sin imports: `dominio/` no
 * depende de nada fuera de sí mismo ni de `compartido/` (skill `luxeboreal-arquitectura` §2).
 */

/** Departamento DANE; `id` es su código de 2 dígitos (llave natural, ADR-0007). */
export interface Departamento {
  readonly id: string;
  readonly nombre: string;
}

/** Ciudad DANE; `id` es su código de 5 dígitos (llave natural, ADR-0007). */
export interface Ciudad {
  readonly id: string;
  readonly departamentoId: string;
  readonly nombre: string;
}

/** Catálogo completo interpretado de la fuente DIVIPOLA (D9). */
export interface CatalogoGeografico {
  readonly departamentos: readonly Departamento[];
  readonly ciudades: readonly Ciudad[];
}

/**
 * Un código de departamento DANE válido tiene exactamente 2 dígitos (D9). Se usa para validar
 * antes de guardar y al interpretar la fuente DIVIPOLA.
 */
export function esCodigoDepartamentoValido(codigo: string): boolean {
  return /^\d{2}$/.test(codigo);
}

/**
 * Un código de ciudad DANE válido tiene exactamente 5 dígitos y sus dos primeros dígitos
 * coinciden con el código de su departamento (jerarquía DANE, D9).
 */
export function esCodigoCiudadValido(codigo: string, departamentoId: string): boolean {
  return /^\d{5}$/.test(codigo) && codigo.startsWith(departamentoId);
}

/**
 * Se lanza cuando la fuente DIVIPOLA viola una de sus reglas de forma (D9): relleno de ceros,
 * longitud de código, jerarquía departamento/ciudad, o códigos repetidos con nombres distintos.
 * Nombra la fila y la regla violada; nunca vuelca el contenido completo del archivo (P15).
 */
export class FuenteDivipolaInvalida extends Error {
  constructor(
    public readonly fila: number,
    public readonly regla: string,
  ) {
    super(`Fila ${fila} del archivo DIVIPOLA viola la regla: ${regla}`);
    this.name = 'FuenteDivipolaInvalida';
  }
}
