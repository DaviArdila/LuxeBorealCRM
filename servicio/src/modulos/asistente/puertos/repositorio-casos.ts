import type { ClaveSistema } from '../dominio/sistema.js';
import type { ModoCaso } from './consulta-casos.js';

/** Token de inyección del puerto {@link RepositorioCasos}. */
export const REPOSITORIO_CASOS = Symbol('REPOSITORIO_CASOS');

/** Un caso de intención activo con lo que el agente necesita: se ordena por categoría y título al leerlo. */
export interface CasoDeIntencion {
  readonly titulo: string;
  readonly tituloNormalizado: string;
  readonly cuandoAplica: string;
  readonly modo: ModoCaso;
  readonly texto: string;
}

/**
 * Lectura y escritura de los casos del sistema (CAS4, CAS7). Las lecturas pueden lanzar: quien las llama decide cómo seguir
 * (el puerto de textos cae al respaldo). La clave siempre es de la lista cerrada: la API no crea casos con otra (CAS4).
 */
export interface RepositorioCasos {
  /** Clave del sistema → texto de los casos con clave del sistema que tienen un texto guardado (aunque sea en blanco). */
  leerTextosDelSistema(): Promise<ReadonlyMap<string, string>>;
  /** Los casos de intención activos por orden de categoría y luego por título (CAS8, CAS10). */
  leerCasosDeIntencion(): Promise<readonly CasoDeIntencion[]>;
  /** Reemplaza el texto del caso (lo crea con su título y categoría de la lista cerrada si falta). `ahora` es del `Clock`. */
  guardarTextoDelSistema(clave: ClaveSistema, texto: string, ahora: Date): Promise<void>;
}
