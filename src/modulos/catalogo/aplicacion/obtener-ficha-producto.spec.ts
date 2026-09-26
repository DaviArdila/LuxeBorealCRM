import { formatearCop, formatearRecargoContraentrega } from '../../../compartido/dinero/index.js';
import type { Producto } from '../dominio/producto.js';
import { ProductoNoDisponible } from '../dominio/producto.js';
import type { RepositorioParametroCatalogo } from '../puertos/repositorio-parametro.js';
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
  constructor(private readonly producto: Producto | null) {}
  listarActivosResumen(): Promise<readonly never[]> {
    throw new Error('no usado por ObtenerFichaProducto');
  }
  buscarPorIdOSku(): Promise<Producto | null> {
    return Promise.resolve(this.producto);
  }
}

/** Doble de {@link RepositorioParametroCatalogo}: solo el recargo contraentrega importa aquí. */
class RepositorioParametroFalso implements RepositorioParametroCatalogo {
  constructor(private readonly recargoContraentregaPct: number) {}
  obtenerFactorVolumetrico(): Promise<number> {
    throw new Error('no usado por ObtenerFichaProducto');
  }
  obtenerRecargoContraentregaPct(): Promise<number> {
    return Promise.resolve(this.recargoContraentregaPct);
  }
  obtenerMensajeFueraCobertura(): Promise<string> {
    throw new Error('no usado por ObtenerFichaProducto');
  }
}

describe('modulos/catalogo/aplicacion/ObtenerFichaProducto', () => {
  it('CAT3 — Ficha de un producto inactivo se rechaza', async () => {
    const inactivo: Producto = { ...PRODUCTO_ACTIVO, activo: false };
    const caso = new ObtenerFichaProducto(new RepositorioProductoFalso(inactivo), new RepositorioParametroFalso(5));

    const promesa = caso.ejecutar('SKU-1');

    await expect(promesa).rejects.toBeInstanceOf(ProductoNoDisponible);
    // "sin devolver ningún dato del producto": el rechazo no lleva precio, sku ni ningún campo.
    await promesa.catch((error: unknown) => {
      expect(error).not.toHaveProperty('precioTexto');
      expect(error).not.toHaveProperty('sku');
    });
  });

  it('CAT3 — Ficha de un producto inexistente se rechaza', async () => {
    const caso = new ObtenerFichaProducto(new RepositorioProductoFalso(null), new RepositorioParametroFalso(5));

    await expect(caso.ejecutar('inexistente')).rejects.toBeInstanceOf(ProductoNoDisponible);
  });

  it('arma la ficha de un producto activo con el recargo leído del parámetro del negocio', async () => {
    const caso = new ObtenerFichaProducto(new RepositorioProductoFalso(PRODUCTO_ACTIVO), new RepositorioParametroFalso(5));

    const ficha = await caso.ejecutar('SKU-1');

    expect(ficha).toEqual({
      id: 'p1',
      sku: 'SKU-1',
      nombre: 'Producto Uno',
      descripcionLarga: 'larga',
      precioTexto: formatearCop(123456),
      recargoContraentregaTexto: formatearRecargoContraentrega(5),
      tieneFotos: true,
    });
  });
});
