import type { CasoAdmin, Categoria, ConsultaListado } from '../dominio/administracion.js';
import type { ModoCaso } from './consulta-casos.js';

/** Token de inyección del puerto {@link RepositorioAdministracion}. */
export const REPOSITORIO_ADMINISTRACION = Symbol('REPOSITORIO_ADMINISTRACION');

/** Los campos de un caso que un admin escribe (CAS3); la normalización de título y búsqueda la hace el repositorio. */
export interface DatosCasoEscribible {
  readonly categoriaId: string;
  readonly titulo: string;
  readonly tituloNormalizado: string;
  readonly cuandoAplica: string;
  readonly texto: string;
  readonly modo: ModoCaso;
  readonly activo: boolean;
}

/** Un caso nuevo siempre es de intención y sin clave del sistema (CAS4): la API no crea casos del sistema. */
export type DatosCasoNuevo = DatosCasoEscribible;

/**
 * Lectura y escritura de categorías y casos para la API de administración (CAS2, CAS3, CAS9, CAS10). Cada operación que
 * puede fallar por una regla de datos devuelve un valor con la razón en vez de lanzar: la base es quien impone la unicidad
 * (CAS1), así que dos admins que crean lo mismo a la vez ven un solo ganador y un `duplicada` limpio.
 */
export interface RepositorioAdministracion {
  /** En orden, con su cantidad de casos. */
  listarCategorias(): Promise<readonly Categoria[]>;
  crearCategoria(nombre: string, nombreNormalizado: string, ahora: Date): Promise<Categoria | 'duplicada'>;
  renombrarCategoria(id: string, nombre: string, nombreNormalizado: string, ahora: Date): Promise<Categoria | 'inexistente' | 'duplicada'>;
  /** `ids` es la lista completa de categorías en el orden deseado; si no coincide con las existentes no cambia nada. */
  ordenarCategorias(ids: readonly string[], ahora: Date): Promise<readonly Categoria[] | 'no-coincide'>;
  borrarCategoria(id: string): Promise<'borrada' | 'inexistente' | 'con-casos'>;

  /** Lee `limite + 1` casos desde la posición del cursor, por orden de categoría, título e id. */
  listarCasos(consulta: ConsultaListado): Promise<readonly CasoAdmin[]>;
  obtenerCaso(id: string): Promise<CasoAdmin | null>;
  crearCaso(datos: DatosCasoNuevo, ahora: Date): Promise<CasoAdmin | 'categoria-inexistente' | 'duplicado'>;
  /**
   * Escribe los campos del caso solo si su `actualizado` en la base sigue siendo `actualizadoLeido` (bloqueo optimista, CAS3).
   * Un caso con clave del sistema conserva clave y disparador; la categoría debe existir.
   */
  editarCaso(
    id: string,
    datos: DatosCasoEscribible,
    actualizadoLeido: Date,
    ahora: Date,
  ): Promise<CasoAdmin | 'inexistente' | 'modificado' | 'duplicado' | 'categoria-inexistente'>;
  /** Un caso con clave del sistema no se borra (CAS4). */
  borrarCaso(id: string): Promise<'borrado' | 'inexistente' | 'del-sistema'>;
}
