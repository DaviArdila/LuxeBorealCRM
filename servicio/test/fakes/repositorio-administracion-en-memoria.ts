import type { CasoAdmin, Categoria, ConsultaListado } from '../../src/modulos/asistente/dominio/administracion.js';
import type {
  DatosCasoEscribible,
  DatosCasoNuevo,
  RepositorioAdministracion,
} from '../../src/modulos/asistente/puertos/repositorio-administracion.js';

interface FilaCategoria {
  id: string;
  nombre: string;
  nombreNormalizado: string;
  orden: number;
}

interface FilaCaso extends Omit<CasoAdmin, 'categoriaNombre' | 'categoriaOrden'> {
  tituloNormalizado: string;
}

/**
 * Doble de test de {@link RepositorioAdministracion}: guarda categorías y casos en memoria con la misma unicidad y los mismos
 * resultados que la base (la unicidad real, el orden y el cursor contra Postgres se prueban en integración).
 */
export class RepositorioAdministracionEnMemoria implements RepositorioAdministracion {
  readonly categorias: FilaCategoria[] = [];
  readonly casos: FilaCaso[] = [];
  private contador = 0;

  /** Siembra una categoría directo, sin pasar por el caso de uso. */
  sembrarCategoria(nombre: string, orden = this.categorias.length): FilaCategoria {
    const fila = { id: this.nuevoId('cat'), nombre, nombreNormalizado: nombre.toLowerCase(), orden };
    this.categorias.push(fila);
    return fila;
  }

  /** Siembra un caso directo (de intención por defecto); `categoriaId` debe existir. */
  sembrarCaso(datos: Partial<FilaCaso> & { categoriaId: string; titulo: string }): FilaCaso {
    const fila: FilaCaso = {
      id: this.nuevoId('caso'),
      cuandoAplica: 'Cuando aplique.',
      texto: 'Texto.',
      modo: 'literal',
      disparador: 'intencion',
      claveSistema: null,
      activo: true,
      creado: new Date('2026-10-06T10:00:00Z'),
      actualizado: new Date('2026-10-06T10:00:00Z'),
      ...datos,
      tituloNormalizado: datos.titulo.toLowerCase(),
    };
    this.casos.push(fila);
    return fila;
  }

  listarCategorias(): Promise<readonly Categoria[]> {
    return Promise.resolve(this.vistaCategorias());
  }

  crearCategoria(nombre: string, nombreNormalizado: string): Promise<Categoria | 'duplicada'> {
    if (this.categorias.some((c) => c.nombreNormalizado === nombreNormalizado)) return Promise.resolve('duplicada');
    const fila = { id: this.nuevoId('cat'), nombre, nombreNormalizado, orden: this.categorias.length };
    this.categorias.push(fila);
    return Promise.resolve({ id: fila.id, nombre, orden: fila.orden, totalCasos: 0 });
  }

  renombrarCategoria(id: string, nombre: string, nombreNormalizado: string): Promise<Categoria | 'inexistente' | 'duplicada'> {
    const fila = this.categorias.find((c) => c.id === id);
    if (fila === undefined) return Promise.resolve('inexistente');
    if (this.categorias.some((c) => c.id !== id && c.nombreNormalizado === nombreNormalizado)) return Promise.resolve('duplicada');
    fila.nombre = nombre;
    fila.nombreNormalizado = nombreNormalizado;
    return Promise.resolve(this.vistaCategorias().find((c) => c.id === id) as Categoria);
  }

  ordenarCategorias(ids: readonly string[]): Promise<readonly Categoria[] | 'no-coincide'> {
    const existentes = this.categorias.map((c) => c.id).sort();
    if (ids.length !== existentes.length || [...ids].sort().some((id, i) => id !== existentes[i])) return Promise.resolve('no-coincide');
    ids.forEach((id, orden) => {
      const fila = this.categorias.find((c) => c.id === id);
      if (fila !== undefined) fila.orden = orden;
    });
    return Promise.resolve(this.vistaCategorias());
  }

  borrarCategoria(id: string): Promise<'borrada' | 'inexistente' | 'con-casos'> {
    if (!this.categorias.some((c) => c.id === id)) return Promise.resolve('inexistente');
    if (this.casos.some((c) => c.categoriaId === id)) return Promise.resolve('con-casos');
    this.categorias.splice(this.categorias.findIndex((c) => c.id === id), 1);
    return Promise.resolve('borrada');
  }

  listarCasos(consulta: ConsultaListado): Promise<readonly CasoAdmin[]> {
    const q = consulta.qNormalizada;
    const filtrados = this.casos
      .filter((c) => consulta.categoriaId === null || c.categoriaId === consulta.categoriaId)
      .filter((c) => consulta.disparador === null || c.disparador === consulta.disparador)
      .filter((c) => consulta.activo === null || c.activo === consulta.activo)
      .filter((c) => q === null || `${c.titulo} ${c.cuandoAplica} ${c.texto}`.toLowerCase().includes(q))
      .sort((a, b) => this.ordenDe(a.categoriaId) - this.ordenDe(b.categoriaId) || a.tituloNormalizado.localeCompare(b.tituloNormalizado));
    const desde = consulta.despues === null ? 0 : filtrados.findIndex((c) => c.id === consulta.despues?.id) + 1;
    return Promise.resolve(filtrados.slice(desde, desde + consulta.limite + 1).map((c) => this.vistaCaso(c)));
  }

  obtenerCaso(id: string): Promise<CasoAdmin | null> {
    const fila = this.casos.find((c) => c.id === id);
    return Promise.resolve(fila === undefined ? null : this.vistaCaso(fila));
  }

  crearCaso(datos: DatosCasoNuevo, ahora: Date): Promise<CasoAdmin | 'categoria-inexistente' | 'duplicado'> {
    if (!this.categorias.some((c) => c.id === datos.categoriaId)) return Promise.resolve('categoria-inexistente');
    if (this.casos.some((c) => c.tituloNormalizado === datos.tituloNormalizado)) return Promise.resolve('duplicado');
    const fila: FilaCaso = {
      id: this.nuevoId('caso'),
      categoriaId: datos.categoriaId,
      titulo: datos.titulo,
      tituloNormalizado: datos.tituloNormalizado,
      cuandoAplica: datos.cuandoAplica,
      texto: datos.texto,
      modo: datos.modo,
      disparador: 'intencion',
      claveSistema: null,
      activo: datos.activo,
      creado: ahora,
      actualizado: ahora,
    };
    this.casos.push(fila);
    return Promise.resolve(this.vistaCaso(fila));
  }

  editarCaso(
    id: string,
    datos: DatosCasoEscribible,
    actualizadoLeido: Date,
    ahora: Date,
  ): Promise<CasoAdmin | 'inexistente' | 'modificado' | 'duplicado' | 'categoria-inexistente'> {
    const fila = this.casos.find((c) => c.id === id);
    if (fila === undefined) return Promise.resolve('inexistente');
    if (fila.actualizado.getTime() !== actualizadoLeido.getTime()) return Promise.resolve('modificado');
    if (!this.categorias.some((c) => c.id === datos.categoriaId)) return Promise.resolve('categoria-inexistente');
    if (this.casos.some((c) => c.id !== id && c.tituloNormalizado === datos.tituloNormalizado)) return Promise.resolve('duplicado');
    Object.assign(fila, {
      categoriaId: datos.categoriaId,
      titulo: datos.titulo,
      tituloNormalizado: datos.tituloNormalizado,
      cuandoAplica: datos.cuandoAplica,
      texto: datos.texto,
      modo: datos.modo,
      activo: datos.activo,
      actualizado: ahora,
    });
    return Promise.resolve(this.vistaCaso(fila));
  }

  borrarCaso(id: string): Promise<'borrado' | 'inexistente' | 'del-sistema'> {
    const fila = this.casos.find((c) => c.id === id);
    if (fila === undefined) return Promise.resolve('inexistente');
    if (fila.claveSistema !== null) return Promise.resolve('del-sistema');
    this.casos.splice(this.casos.indexOf(fila), 1);
    return Promise.resolve('borrado');
  }

  private nuevoId(prefijo: string): string {
    this.contador += 1;
    return `${prefijo}-${String(this.contador)}`;
  }

  private ordenDe(categoriaId: string): number {
    return this.categorias.find((c) => c.id === categoriaId)?.orden ?? 0;
  }

  private vistaCategorias(): Categoria[] {
    return [...this.categorias]
      .sort((a, b) => a.orden - b.orden)
      .map((c) => ({ id: c.id, nombre: c.nombre, orden: c.orden, totalCasos: this.casos.filter((k) => k.categoriaId === c.id).length }));
  }

  private vistaCaso(fila: FilaCaso): CasoAdmin {
    const caso: Omit<FilaCaso, 'tituloNormalizado'> & { tituloNormalizado?: string } = { ...fila };
    delete caso.tituloNormalizado;
    return { ...caso, categoriaNombre: this.categorias.find((c) => c.id === fila.categoriaId)?.nombre ?? '', categoriaOrden: this.ordenDe(fila.categoriaId) };
  }
}
