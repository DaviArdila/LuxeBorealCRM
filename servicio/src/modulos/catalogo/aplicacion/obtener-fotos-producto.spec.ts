import { formatearCop } from '../../../compartido/dinero/index.js';
import type { FotoProducto, Producto } from '../dominio/producto.js';
import { ProductoNoDisponible } from '../dominio/producto.js';
import type { RepositorioProducto } from '../puertos/repositorio-producto.js';
import { ObtenerFotosProducto } from './obtener-fotos-producto.js';

// Escenarios CAT14 y AGT17 de `openspec/changes/fase-08b-comportamiento-agente/specs/`.

const PRODUCTO: Producto = {
  id: 'p1',
  sku: 'SKU-1',
  nombre: 'Anillo Aurora',
  descripcionCorta: 'Oro laminado 18k',
  descripcionLarga: 'larga',
  precioCop: 100000,
  activo: true,
  pesoGramos: 10,
  largoMm: null,
  anchoMm: null,
  altoMm: null,
  tieneFotos: true,
};

// Ya vienen en orden de envío: la portada primero (CAT14).
const FOTOS: readonly FotoProducto[] = [
  { claveObjeto: 'catalogo/SKU-1/foto-2.jpg', angulo: 'frente' },
  { claveObjeto: 'catalogo/SKU-1/foto-1.jpg', angulo: 'lateral_izquierdo' },
  { claveObjeto: 'catalogo/SKU-1/foto-3.jpg', angulo: 'detalle' },
];

class RepositorioProductoFalso implements RepositorioProducto {
  fotosConsultadas: string[] = [];
  constructor(
    private readonly producto: Producto | null,
    private readonly fotos: readonly FotoProducto[],
  ) {}
  listarActivosResumen(): Promise<never> {
    throw new Error('no usado');
  }
  buscarPorIdOSku(): Promise<Producto | null> {
    return Promise.resolve(this.producto);
  }
  listarFotos(productoId: string): Promise<readonly FotoProducto[]> {
    this.fotosConsultadas.push(productoId);
    return Promise.resolve(this.fotos);
  }
}

describe('modulos/catalogo/aplicacion/ObtenerFotosProducto', () => {
  it('CAT14 — Sin ángulo devuelve la portada', async () => {
    const repositorio = new RepositorioProductoFalso(PRODUCTO, FOTOS);

    const resultado = await new ObtenerFotosProducto(repositorio).ejecutar('SKU-1');

    expect(repositorio.fotosConsultadas).toEqual(['p1']);
    expect(resultado.foto).toEqual({ claveObjeto: 'catalogo/SKU-1/foto-2.jpg', angulo: 'frente' });
    expect(resultado.angulosDisponibles).toEqual(['frente', 'lateral_izquierdo', 'detalle']);
  });

  it('CAT14 — Con ángulo devuelve la foto de ese ángulo', async () => {
    const repositorio = new RepositorioProductoFalso(PRODUCTO, FOTOS);

    const resultado = await new ObtenerFotosProducto(repositorio).ejecutar('SKU-1', 'detalle');

    expect(resultado.foto).toEqual({ claveObjeto: 'catalogo/SKU-1/foto-3.jpg', angulo: 'detalle' });
  });

  it('CAT14 — Un ángulo que no existe devuelve vacío', async () => {
    const repositorio = new RepositorioProductoFalso(PRODUCTO, FOTOS);

    const resultado = await new ObtenerFotosProducto(repositorio).ejecutar('SKU-1', 'uso');

    expect(resultado.foto).toBeNull();
    expect(resultado.angulosDisponibles).toEqual(['frente', 'lateral_izquierdo', 'detalle']);
  });

  it('CAT14 — Las fotos de un producto inactivo se rechazan', async () => {
    const repositorio = new RepositorioProductoFalso({ ...PRODUCTO, activo: false }, FOTOS);

    await expect(new ObtenerFotosProducto(repositorio).ejecutar('SKU-1')).rejects.toBeInstanceOf(ProductoNoDisponible);
    expect(repositorio.fotosConsultadas).toEqual([]);
  });

  it('un producto inexistente se rechaza como en CAT3', async () => {
    const repositorio = new RepositorioProductoFalso(null, []);

    await expect(new ObtenerFotosProducto(repositorio).ejecutar('no-existe')).rejects.toBeInstanceOf(ProductoNoDisponible);
  });

  it('un producto sin fotos devuelve vacío y sin ángulos disponibles', async () => {
    const resultado = await new ObtenerFotosProducto(new RepositorioProductoFalso(PRODUCTO, [])).ejecutar('SKU-1');

    expect(resultado.foto).toBeNull();
    expect(resultado.angulosDisponibles).toEqual([]);
  });

  it('las fotos sin ángulo se pueden enviar como portada pero no se piden por ángulo', async () => {
    const sinAngulo: readonly FotoProducto[] = [
      { claveObjeto: 'a.jpg', angulo: null },
      { claveObjeto: 'b.jpg', angulo: null },
    ];
    const caso = new ObtenerFotosProducto(new RepositorioProductoFalso(PRODUCTO, sinAngulo));

    const portada = await caso.ejecutar('SKU-1');
    const porAngulo = await caso.ejecutar('SKU-1', 'frente');

    expect(portada.foto?.claveObjeto).toBe('a.jpg');
    expect(portada.angulosDisponibles).toEqual([]);
    expect(porAngulo.foto).toBeNull();
  });

  it('con dos fotos del mismo ángulo gana la primera en orden y el ángulo no se repite', async () => {
    const repetidas: readonly FotoProducto[] = [
      { claveObjeto: 'a.jpg', angulo: 'detalle' },
      { claveObjeto: 'b.jpg', angulo: 'detalle' },
    ];
    const resultado = await new ObtenerFotosProducto(new RepositorioProductoFalso(PRODUCTO, repetidas)).ejecutar('SKU-1', 'detalle');

    expect(resultado.foto?.claveObjeto).toBe('a.jpg');
    expect(resultado.angulosDisponibles).toEqual(['detalle']);
  });

  it('AGT17 — El pie de foto lleva nombre, descripción y precio del backend', async () => {
    const resultado = await new ObtenerFotosProducto(new RepositorioProductoFalso(PRODUCTO, FOTOS)).ejecutar('SKU-1');

    expect(resultado.leyenda).toBe(`Anillo Aurora — Oro laminado 18k\n${formatearCop(100000)}`);
  });

  it('AGT17 — El pie de foto no lleva el SKU', async () => {
    const resultado = await new ObtenerFotosProducto(new RepositorioProductoFalso(PRODUCTO, FOTOS)).ejecutar('SKU-1');

    expect(resultado.leyenda).not.toContain('SKU');
  });
});
