import type { FotosProducto, Producto } from '../dominio/producto.js';
import { ProductoNoDisponible } from '../dominio/producto.js';
import type { RepositorioProducto } from '../puertos/repositorio-producto.js';
import { ObtenerFotosProducto } from './obtener-fotos-producto.js';

// Escenarios CAT14 de `openspec/changes/fase-07b-agente-llm-herramientas/specs/catalogo/spec.md`.

const PRODUCTO: Producto = {
  id: 'p1',
  sku: 'SKU-1',
  nombre: 'Anillo',
  descripcionCorta: 'corta',
  descripcionLarga: 'larga',
  precioCop: 100000,
  activo: true,
  pesoGramos: 10,
  largoMm: null,
  anchoMm: null,
  altoMm: null,
  tieneFotos: true,
};

class RepositorioProductoFalso implements RepositorioProducto {
  fotosConsultadas: string[] = [];
  constructor(
    private readonly producto: Producto | null,
    private readonly fotos: FotosProducto,
  ) {}
  listarActivosResumen(): Promise<never> {
    throw new Error('no usado');
  }
  buscarPorIdOSku(): Promise<Producto | null> {
    return Promise.resolve(this.producto);
  }
  listarFotos(productoId: string): Promise<FotosProducto> {
    this.fotosConsultadas.push(productoId);
    return Promise.resolve(this.fotos);
  }
}

describe('modulos/catalogo/aplicacion/ObtenerFotosProducto', () => {
  it('CAT14 — Un producto con fotos devuelve su collage y las fotos en orden', async () => {
    const repositorio = new RepositorioProductoFalso(PRODUCTO, {
      claveCollage: 'catalogo/SKU-1/collage.jpg',
      clavesFotos: ['catalogo/SKU-1/foto-2.jpg', 'catalogo/SKU-1/foto-1.jpg', 'catalogo/SKU-1/foto-3.jpg'],
    });

    const resultado = await new ObtenerFotosProducto(repositorio).ejecutar('SKU-1', 4);

    expect(resultado).toEqual({
      claveCollage: 'catalogo/SKU-1/collage.jpg',
      clavesFotos: ['catalogo/SKU-1/foto-2.jpg', 'catalogo/SKU-1/foto-1.jpg', 'catalogo/SKU-1/foto-3.jpg'],
    });
    expect(repositorio.fotosConsultadas).toEqual(['p1']);
  });

  it('CAT14 — El máximo pedido limita las fotos individuales', async () => {
    const repositorio = new RepositorioProductoFalso(PRODUCTO, {
      claveCollage: null,
      clavesFotos: ['a', 'b', 'c', 'd', 'e'],
    });

    const resultado = await new ObtenerFotosProducto(repositorio).ejecutar('SKU-1', 2);

    expect(resultado.clavesFotos).toEqual(['a', 'b']);
    expect(resultado.claveCollage).toBeNull();
  });

  it('CAT14 — Las fotos de un producto inactivo se rechazan', async () => {
    const repositorio = new RepositorioProductoFalso(
      { ...PRODUCTO, activo: false },
      { claveCollage: 'c', clavesFotos: ['a'] },
    );

    await expect(new ObtenerFotosProducto(repositorio).ejecutar('SKU-1', 4)).rejects.toBeInstanceOf(
      ProductoNoDisponible,
    );
    expect(repositorio.fotosConsultadas).toEqual([]);
  });

  it('un producto inexistente se rechaza igual que uno inactivo (CAT3)', async () => {
    const repositorio = new RepositorioProductoFalso(null, { claveCollage: null, clavesFotos: [] });

    await expect(new ObtenerFotosProducto(repositorio).ejecutar('no-existe', 4)).rejects.toBeInstanceOf(
      ProductoNoDisponible,
    );
  });

  it('un máximo de cero no devuelve fotos individuales', async () => {
    const repositorio = new RepositorioProductoFalso(PRODUCTO, { claveCollage: 'c', clavesFotos: ['a', 'b'] });

    const resultado = await new ObtenerFotosProducto(repositorio).ejecutar('SKU-1', 0);

    expect(resultado).toEqual({ claveCollage: 'c', clavesFotos: [] });
  });
});
