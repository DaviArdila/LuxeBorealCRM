import type { ProductoResumen } from '../dominio/producto.js';
import type { CacheCatalogo } from '../puertos/cache-catalogo.js';
import type { RepositorioProducto } from '../puertos/repositorio-producto.js';
import { ListarProductosActivos } from './listar-productos-activos.js';

const ACTIVO: ProductoResumen = { id: 'p1', sku: 'SKU-1', nombre: 'Activo', descripcionCorta: 'x' };

/**
 * Doble de {@link RepositorioProducto}: reproduce el contrato real de `listarActivosResumen`
 * (ya excluye inactivos, T5) devolviendo solo el resumen que se le configura.
 */
class RepositorioProductoFalso implements RepositorioProducto {
  llamadas = 0;
  constructor(private readonly resumen: readonly ProductoResumen[]) {}
  listarActivosResumen(): Promise<readonly ProductoResumen[]> {
    this.llamadas++;
    return Promise.resolve(this.resumen);
  }
  buscarPorIdOSku(): Promise<never> {
    throw new Error('no usado por ListarProductosActivos');
  }
  listarFotos(): Promise<never> {
    throw new Error('no usado por este caso de uso');
  }
}

/** Doble de {@link CacheCatalogo}: registra el orden de llamadas y lo que se le reemplaza. */
class CacheCatalogoFalsa implements CacheCatalogo {
  llamadasEnOrden: string[] = [];
  reemplazados: readonly ProductoResumen[] | undefined;
  constructor(private readonly vigente: readonly ProductoResumen[] | null) {}
  obtenerVigente(): Promise<readonly ProductoResumen[] | null> {
    this.llamadasEnOrden.push('obtenerVigente');
    return Promise.resolve(this.vigente);
  }
  reemplazar(productos: readonly ProductoResumen[]): Promise<void> {
    this.llamadasEnOrden.push('reemplazar');
    this.reemplazados = productos;
    return Promise.resolve();
  }
  invalidar(): Promise<void> {
    throw new Error('no usado por ListarProductosActivos');
  }
}

describe('modulos/catalogo/aplicacion/ListarProductosActivos', () => {
  it('CAT1 — El listado de productos activos no lleva precio', async () => {
    const caso = new ListarProductosActivos(new RepositorioProductoFalso([ACTIVO]), new CacheCatalogoFalsa(null));

    const resultado = await caso.ejecutar();

    expect(resultado).toEqual([ACTIVO]);
    expect(Object.keys(resultado[0] as object)).not.toContain('precioCop');
  });

  it('CAT1 — El listado excluye productos inactivos', async () => {
    // El doble reproduce el contrato real de REPOSITORIO_PRODUCTO.listarActivosResumen (T5): un
    // producto inactivo del catálogo nunca aparece en lo que devuelve.
    const repositorio = new RepositorioProductoFalso([ACTIVO]);
    const caso = new ListarProductosActivos(repositorio, new CacheCatalogoFalsa(null));

    const resultado = await caso.ejecutar();

    expect(resultado).toEqual([ACTIVO]);
    expect(resultado.some((p) => p.id === 'inactivo')).toBe(false);
  });

  it('sin copia vigente, pide obtenerVigente() a la caché antes que listarActivosResumen() al repositorio, y guarda la copia nueva', async () => {
    const repositorio = new RepositorioProductoFalso([ACTIVO]);
    const cache = new CacheCatalogoFalsa(null);
    const caso = new ListarProductosActivos(repositorio, cache);

    const resultado = await caso.ejecutar();

    expect(cache.llamadasEnOrden).toEqual(['obtenerVigente', 'reemplazar']);
    expect(repositorio.llamadas).toBe(1);
    expect(cache.reemplazados).toEqual([ACTIVO]);
    expect(resultado).toEqual([ACTIVO]);
  });

  it('con copia vigente, devuelve la copia de la caché sin llamar al repositorio', async () => {
    const repositorio = new RepositorioProductoFalso([ACTIVO]);
    const caso = new ListarProductosActivos(repositorio, new CacheCatalogoFalsa([ACTIVO]));

    const resultado = await caso.ejecutar();

    expect(resultado).toEqual([ACTIVO]);
    expect(repositorio.llamadas).toBe(0);
  });
});
