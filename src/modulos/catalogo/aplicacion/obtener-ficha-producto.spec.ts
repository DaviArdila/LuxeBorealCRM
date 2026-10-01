import { formatearCop } from '../../../compartido/dinero/index.js';
import type { FotoProducto, Producto } from '../dominio/producto.js';
import { ProductoNoDisponible } from '../dominio/producto.js';
import type { RepositorioProducto } from '../puertos/repositorio-producto.js';
import { ObtenerFichaProducto } from './obtener-ficha-producto.js';

const PRODUCTO_ACTIVO: Producto = {
  id: 'p1',
  sku: 'SKU-1',
  nombre: 'Producto Uno',
  descripcionCorta: 'corta',
  descripcionLarga: 'larga',
  precioCop: 123456,
  activo: true,
  pesoGramos: 500,
  largoMm: null,
  anchoMm: null,
  altoMm: null,
  tieneFotos: true,
};

/** Doble de {@link RepositorioProducto}: `listarActivosResumen` no lo usa este caso de uso. */
class RepositorioProductoFalso implements RepositorioProducto {
  constructor(
    private readonly producto: Producto | null,
    private readonly fotos: readonly FotoProducto[] = [],
  ) {}
  listarActivosResumen(): Promise<readonly never[]> {
    throw new Error('no usado por ObtenerFichaProducto');
  }
  buscarPorIdOSku(): Promise<Producto | null> {
    return Promise.resolve(this.producto);
  }
  listarFotos(): Promise<readonly FotoProducto[]> {
    return Promise.resolve(this.fotos);
  }
}

describe('modulos/catalogo/aplicacion/ObtenerFichaProducto', () => {
  it('CAT3 — Ficha de un producto inactivo se rechaza', async () => {
    const inactivo: Producto = { ...PRODUCTO_ACTIVO, activo: false };
    const caso = new ObtenerFichaProducto(new RepositorioProductoFalso(inactivo));

    const promesa = caso.ejecutar('SKU-1');

    await expect(promesa).rejects.toBeInstanceOf(ProductoNoDisponible);
    // "sin devolver ningún dato del producto": el rechazo no lleva precio, sku ni ningún campo.
    await promesa.catch((error: unknown) => {
      expect(error).not.toHaveProperty('precioTexto');
      expect(error).not.toHaveProperty('sku');
    });
  });

  it('CAT3 — Ficha de un producto inexistente se rechaza', async () => {
    const caso = new ObtenerFichaProducto(new RepositorioProductoFalso(null));

    await expect(caso.ejecutar('inexistente')).rejects.toBeInstanceOf(ProductoNoDisponible);
  });

  it('CAT2 — arma la ficha de un producto activo sin ningún dato del recargo contra entrega', async () => {
    const caso = new ObtenerFichaProducto(new RepositorioProductoFalso(PRODUCTO_ACTIVO));

    const ficha = await caso.ejecutar('SKU-1');

    expect(ficha).toEqual({
      id: 'p1',
      sku: 'SKU-1',
      nombre: 'Producto Uno',
      descripcionLarga: 'larga',
      precioTexto: formatearCop(123456),
      tieneFotos: true,
      angulosFotos: [],
    });
  });

  it('la ficha lista los ángulos de las fotos disponibles, sin repetir ni contar las sin etiquetar', async () => {
    const fotos: readonly FotoProducto[] = [
      { claveObjeto: 'a', angulo: 'frente' },
      { claveObjeto: 'b', angulo: null },
      { claveObjeto: 'c', angulo: 'detalle' },
      { claveObjeto: 'd', angulo: 'frente' },
    ];
    const caso = new ObtenerFichaProducto(new RepositorioProductoFalso(PRODUCTO_ACTIVO, fotos));

    const ficha = await caso.ejecutar('SKU-1');

    expect(ficha.angulosFotos).toEqual(['frente', 'detalle']);
  });
});
