import type { ProductoResumen } from '../dominio/producto.js';
import { BuscarProductos } from './buscar-productos.js';
import type { ListarProductosActivos } from './listar-productos-activos.js';

const ACTIVO: ProductoResumen = { id: 'p1', sku: 'SKU-1', nombre: 'Lámpara de mesa', descripcionCorta: 'Roble' };

function crear(activos: readonly ProductoResumen[]) {
  let lecturas = 0;
  const listar = {
    ejecutar: () => {
      lecturas += 1;
      return Promise.resolve(activos);
    },
  } as unknown as ListarProductosActivos;
  return { caso: new BuscarProductos(listar), lecturas: () => lecturas };
}

describe('modulos/catalogo/aplicacion/BuscarProductos', () => {
  it('CAT13 — La búsqueda ignora tildes y mayúsculas sobre el listado de activos', async () => {
    const { caso } = crear([ACTIVO]);

    await expect(caso.ejecutar('LAMPARA')).resolves.toEqual([ACTIVO]);
  });

  it('CAT13 — reutiliza el listado cacheado: una lectura del listado por búsqueda, ninguna a la base', async () => {
    const { caso, lecturas } = crear([ACTIVO]);

    await caso.ejecutar('lampara');
    await caso.ejecutar('mesa');

    expect(lecturas()).toBe(2);
  });
});
