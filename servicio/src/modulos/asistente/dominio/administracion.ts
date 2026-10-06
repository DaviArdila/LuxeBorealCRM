import type { ModoCaso } from '../puertos/consulta-casos.js';

/** Una categoría tal como la ve el admin (CAS2): con cuántos casos tiene. */
export interface Categoria {
  readonly id: string;
  readonly nombre: string;
  readonly orden: number;
  readonly totalCasos: number;
}

/** Un caso tal como lo ve el admin (CAS3, CAS9): con la categoría a la que pertenece y si es del sistema. */
export interface CasoAdmin {
  readonly id: string;
  readonly categoriaId: string;
  readonly categoriaNombre: string;
  /** Posición de su categoría: junto con el título normalizado y el id ordena el listado y arma el cursor (API5). */
  readonly categoriaOrden: number;
  readonly titulo: string;
  readonly cuandoAplica: string;
  readonly texto: string;
  readonly modo: ModoCaso;
  readonly disparador: 'evento' | 'intencion';
  readonly claveSistema: string | null;
  readonly activo: boolean;
  readonly creado: Date;
  /** Con esta fecha se edita (CAS3): si cambió mientras tanto, la edición se rechaza con `caso-modificado`. */
  readonly actualizado: Date;
}

/** Los filtros explícitos del listado (CAS10); `q` ya viene normalizada (minúsculas, sin acentos). */
export interface FiltrosCasos {
  readonly qNormalizada: string | null;
  readonly categoriaId: string | null;
  readonly disparador: 'evento' | 'intencion' | null;
  readonly activo: boolean | null;
}

/** La posición del último caso de una página: el cursor la codifica de forma opaca (API5). */
export interface PosicionCursor {
  readonly ordenCategoria: number;
  readonly tituloNormalizado: string;
  readonly id: string;
}

export interface ConsultaListado extends FiltrosCasos {
  readonly despues: PosicionCursor | null;
  readonly limite: number;
}

/** Una página de casos: el repositorio lee `limite + 1` para saber si hay más. */
export interface PaginaCasos {
  readonly items: readonly CasoAdmin[];
  readonly siguienteCursor: string | null;
}

export const LIMITE_POR_DEFECTO = 20;
export const LIMITE_MAXIMO = 100;
export const MAX_CARACTERES_CATEGORIA = 80;
