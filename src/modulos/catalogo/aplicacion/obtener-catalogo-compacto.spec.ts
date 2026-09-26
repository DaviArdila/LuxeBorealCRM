import type { ProductoResumen } from '../dominio/producto.js';
import type { ListarProductosActivos } from './listar-productos-activos.js';
import { ObtenerCatalogoCompacto } from './obtener-catalogo-compacto.js';

const PRODUCTOS: readonly ProductoResumen[] = [
  { id: 'p2', sku: 'SKU-2', nombre: 'Zeta', descripcionCorta: 'zzz' },
  { id: 'p1', sku: 'SKU-1', nombre: 'Alfa', descripcionCorta: 'aaa' },
];

/**
 * Doble de {@link ListarProductosActivos}: registra si se le llamó, sin depender de sus propios
 * puertos (REPOSITORIO_PRODUCTO/CACHE_CATALOGO ya se prueban en `listar-productos-activos.spec.ts`).
 */
class ListarProductosActivosFalso implements Pick<ListarProductosActivos, 'ejecutar'> {
  llamadas = 0;
  ejecutar(): Promise<readonly ProductoResumen[]> {
    this.llamadas++;
    return Promise.resolve(PRODUCTOS);
  }
}

describe('modulos/catalogo/aplicacion/ObtenerCatalogoCompacto', () => {
  it('compone el texto del catálogo compacto a partir de lo que devuelve ListarProductosActivos (D6: el formateo vive en dominio/producto.ts)', async () => {
    const listarProductosActivos = new ListarProductosActivosFalso();
    const caso = new ObtenerCatalogoCompacto(listarProductosActivos as unknown as ListarProductosActivos);

    const texto = await caso.ejecutar();

    expect(listarProductosActivos.llamadas).toBe(1);
    // Mismo criterio de orden/formato que `armarCatalogoCompacto` (dominio/producto.ts, T3): por
    // nombre, sin ningún valor de dinero.
    expect(texto).toBe('- SKU-1: Alfa — aaa\n- SKU-2: Zeta — zzz');
  });
});
