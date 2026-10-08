import { inject, Injectable, signal } from '@angular/core';
import { Api } from '../../../api/api';
import { borrarCaso } from '../../../api/fn/asistente/borrar-caso';
import { borrarCategoriaCaso } from '../../../api/fn/asistente/borrar-categoria-caso';
import { crearCaso } from '../../../api/fn/asistente/crear-caso';
import { crearCategoriaCaso } from '../../../api/fn/asistente/crear-categoria-caso';
import { editarCaso } from '../../../api/fn/asistente/editar-caso';
import { listarCasos, type ListarCasos$Params } from '../../../api/fn/asistente/listar-casos';
import { listarCategoriasCaso } from '../../../api/fn/asistente/listar-categorias-caso';
import { ordenarCategoriasCaso } from '../../../api/fn/asistente/ordenar-categorias-caso';
import { renombrarCategoriaCaso } from '../../../api/fn/asistente/renombrar-categoria-caso';
import type { RespuestaDe } from '../../../nucleo/tipos';

export type Caso = RespuestaDe<typeof editarCaso>;
export type CategoriaDeCasos = RespuestaDe<typeof crearCategoriaCaso>;
export type DatosNuevoCaso = Parameters<typeof crearCaso>[2]['body'];
export type CambiosDeCaso = Parameters<typeof editarCaso>[2]['body'];

/** Filtros del listado: el servidor los aplica (CAS10); la pantalla solo los manda. */
export interface FiltrosDeCasos {
  readonly q?: string;
  readonly categoriaId?: string;
  readonly disparador?: 'evento' | 'intencion';
}

const PAGINA = 100;
/** Tope de páginas por lectura: 60 casos caben en el índice del bot, así que esto solo evita un ciclo si el cursor no avanza. */
const MAXIMO_DE_PAGINAS = 20;

/** Estado de la pantalla «Casos de uso» (D11): lo que dijo el servidor, sin store global. */
@Injectable()
export class CasosServicio {
  private readonly api = inject(Api);
  private lectura = 0;
  readonly categorias = signal<readonly CategoriaDeCasos[]>([]);
  readonly casos = signal<readonly Caso[]>([]);

  /** Lee las categorías y los casos que cumplen los filtros (el servidor busca y filtra). */
  async cargar(filtros: FiltrosDeCasos): Promise<void> {
    const [categorias] = await Promise.all([this.api.invoke(listarCategoriasCaso), this.cargarCasos(filtros)]);
    this.categorias.set(categorias.categorias);
  }

  /** Solo los casos: el buscador y los filtros no vuelven a leer las categorías. Una respuesta vieja no pisa a una nueva. */
  async cargarCasos(filtros: FiltrosDeCasos): Promise<void> {
    const lectura = ++this.lectura;
    const casos: Caso[] = [];
    let cursor: string | undefined;
    for (let pagina = 0; pagina < MAXIMO_DE_PAGINAS; pagina++) {
      const params: ListarCasos$Params = { limite: PAGINA, ...filtros, ...(cursor === undefined ? {} : { cursor }) };
      const respuesta = await this.api.invoke(listarCasos, params);
      casos.push(...respuesta.items);
      if (respuesta.siguienteCursor === null) break;
      cursor = respuesta.siguienteCursor;
    }
    if (lectura === this.lectura) this.casos.set(casos);
  }

  async crear(datos: DatosNuevoCaso): Promise<Caso> {
    return this.api.invoke(crearCaso, { body: datos });
  }

  async editar(id: string, cambios: CambiosDeCaso): Promise<Caso> {
    return this.api.invoke(editarCaso, { id, body: cambios });
  }

  async borrar(id: string): Promise<void> {
    await this.api.invoke(borrarCaso, { id });
  }

  async crearCategoria(nombre: string): Promise<void> {
    await this.api.invoke(crearCategoriaCaso, { body: { nombre } });
  }

  async renombrarCategoria(id: string, nombre: string): Promise<void> {
    await this.api.invoke(renombrarCategoriaCaso, { id, body: { nombre } });
  }

  async ordenarCategorias(ids: readonly string[]): Promise<void> {
    this.categorias.set((await this.api.invoke(ordenarCategoriasCaso, { body: { ids: [...ids] } })).categorias);
  }

  /** Muestra al instante el orden que se va a mandar; si el servidor lo rechaza, `cargar` devuelve el real. */
  aplicarOrdenCategorias(ids: readonly string[]): void {
    const posicion = new Map(ids.map((id, indice) => [id, indice]));
    this.categorias.update((categorias) =>
      [...categorias].sort((a, b) => (posicion.get(a.id) ?? a.orden) - (posicion.get(b.id) ?? b.orden)),
    );
  }

  async borrarCategoria(id: string): Promise<void> {
    await this.api.invoke(borrarCategoriaCaso, { id });
  }
}
