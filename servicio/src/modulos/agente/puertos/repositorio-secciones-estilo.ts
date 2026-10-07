import type { AutorEstilo } from './repositorio-estilo.js';

/** Token de inyección del puerto {@link RepositorioSeccionesEstilo}. */
export const REPOSITORIO_SECCIONES_ESTILO = Symbol('REPOSITORIO_SECCIONES_ESTILO');

/** Una sección del estilo del bot tal como se guarda (`seccion_estilo`). */
export interface SeccionEstilo {
  readonly id: string;
  readonly titulo: string;
  readonly texto: string;
  readonly orden: number;
  readonly activo: boolean;
  readonly creado: Date;
  /** Marca de edición: el bloqueo optimista compara contra ella. */
  readonly actualizado: Date;
}

/** Lo que el admin escribe de una sección; `tituloNormalizado` (minúsculas, sin acentos) lo calcula quien llama. */
export interface DatosSeccionEstilo {
  readonly titulo: string;
  readonly tituloNormalizado: string;
  readonly texto: string;
  readonly activo: boolean;
}

/**
 * Resultado de un cambio sobre las secciones. `version` es la versión de `version_estilo` que dejó el cambio, o `null` si
 * el estilo compuesto no cambió y no se guardó ninguna foto. `invalido` es el estilo compuesto resultante rechazado por
 * `validarEstilo` (tope, reglas de contenido, vacío); el cambio no se aplicó y el motivo nunca copia el texto (R14).
 */
export type ResultadoCambioSecciones<T> =
  | { readonly ok: true; readonly valor: T; readonly version: number | null }
  | { readonly ok: false; readonly razon: 'inexistente' | 'modificado' | 'duplicada' | 'no-coincide' }
  | { readonly ok: false; readonly razon: 'invalido'; readonly motivo: string };

/**
 * Secciones del estilo (ODD estilo-en-secciones). Cada cambio que altera el estilo compuesto (las activas por `orden`)
 * se aplica en **una sola transacción** que lo valida y guarda su foto en `version_estilo` (historial de diez, autor);
 * quien lo llama sube después la versión compartida. No hay borrado: una sección se apaga con `activo`.
 */
export interface RepositorioSeccionesEstilo {
  /** Todas, activas o no, por `orden`. */
  listar(): Promise<readonly SeccionEstilo[]>;
  /** La sección nueva queda al final. `duplicada` si otro título normaliza igual. */
  crear(datos: DatosSeccionEstilo, ahora: Date, autor?: AutorEstilo | null): Promise<ResultadoCambioSecciones<SeccionEstilo>>;
  /** Bloqueo optimista: `modificado` si `actualizado` ya no es `actualizadoLeido` (otro admin editó primero). */
  editar(
    id: string,
    datos: DatosSeccionEstilo,
    actualizadoLeido: Date,
    ahora: Date,
    autor?: AutorEstilo | null,
  ): Promise<ResultadoCambioSecciones<SeccionEstilo>>;
  /** `ids` debe ser exactamente el conjunto de todas las secciones (`no-coincide` si no); el orden pedido pasa a `orden`. */
  reordenar(ids: readonly string[], ahora: Date, autor?: AutorEstilo | null): Promise<ResultadoCambioSecciones<readonly SeccionEstilo[]>>;
}
