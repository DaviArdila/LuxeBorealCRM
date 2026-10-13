import { ProductoNoDisponible, type BuscarProductos, type FichaProducto, type ObtenerFichaProducto } from '../../../catalogo/index.js';
import { contarMontosSinRastro } from '../../dominio/auditar-dinero.js';
import { crearBuscarProducto } from './buscar-producto.js';
import { crearObtenerFicha } from './obtener-ficha.js';

// AGT8 (buscar_producto): hasta 5 resultados {id, nombre, descripcion_corta}, sin SKU (AGT16); con un solo
// resultado, la ficha de obtener_ficha en `ficha`.

const CONTEXTO = { sesion: { conversacionId: 'c', version: 0 }, contactoId: 'k', efectosPrevios: [] };

describe('modulos/agente/aplicacion/herramientas — buscar_producto', () => {
  const buscar = {
    ejecutar: (texto: string) =>
      Promise.resolve(
        texto === 'lampara'
          ? [{ id: 'p1', sku: 'SKU-1', nombre: 'Lámpara', descripcionCorta: 'De mesa' }]
          : texto === 'collar'
            ? [
                { id: 'p2', sku: 'SKU-2', nombre: 'Collar Luna', descripcionCorta: 'Plata' },
                { id: 'p3', sku: 'SKU-3', nombre: 'Collar Sol', descripcionCorta: 'Oro' },
              ]
            : [],
      ),
  } as unknown as BuscarProductos;
  const FICHA: FichaProducto = {
    id: 'p1',
    sku: 'SKU-1',
    nombre: 'Lámpara',
    descripcionLarga: 'Lámpara de mesa en bronce',
    precioTexto: '$389.000',
    tieneFotos: true,
    angulosFotos: ['frente'],
  };
  const consultadas: string[] = [];
  const ficha = {
    ejecutar: (id: string) => {
      consultadas.push(id);
      return Promise.resolve(FICHA);
    },
  } as unknown as ObtenerFichaProducto;
  beforeEach(() => {
    consultadas.length = 0;
  });

  it('AGT8 — devuelve los productos en el formato del contrato con el modelo, sin dinero', async () => {
    const herramienta = crearBuscarProducto(buscar, ficha);

    const resultado = await herramienta.ejecutar({ query: 'lampara' }, CONTEXTO);

    expect(resultado.paraElModelo).toEqual([expect.objectContaining({ id: 'p1', nombre: 'Lámpara', descripcion_corta: 'De mesa' })]);
    expect(resultado.efectos).toEqual([]);
  });

  it('AGT8 — buscar_producto con un solo resultado trae la misma ficha que obtener_ficha', async () => {
    const resultado = await crearBuscarProducto(buscar, ficha).ejecutar({ query: 'lampara' }, CONTEXTO);
    const deObtenerFicha = await crearObtenerFicha(ficha).ejecutar({ id_producto: 'p1' }, CONTEXTO);

    expect(resultado.paraElModelo).toEqual([
      { id: 'p1', nombre: 'Lámpara', descripcion_corta: 'De mesa', ficha: deObtenerFicha.paraElModelo },
    ]);
    expect(consultadas).toEqual(['p1', 'p1']);
  });

  it('AGT8 — buscar_producto con varios resultados no trae ninguna ficha ni dinero', async () => {
    const resultado = await crearBuscarProducto(buscar, ficha).ejecutar({ query: 'collar' }, CONTEXTO);

    expect(resultado.paraElModelo).toEqual([
      { id: 'p2', nombre: 'Collar Luna', descripcion_corta: 'Plata' },
      { id: 'p3', nombre: 'Collar Sol', descripcion_corta: 'Oro' },
    ]);
    expect(consultadas).toEqual([]);
  });

  it.each([
    ['el producto dejó de estar disponible', new ProductoNoDisponible()],
    ['la base falló', new Error('base caída')],
  ])('si al leer la ficha %s, el resultado sale igual sin ella', async (_caso, error) => {
    const fallida = { ejecutar: () => Promise.reject(error) } as unknown as ObtenerFichaProducto;

    const resultado = await crearBuscarProducto(buscar, fallida).ejecutar({ query: 'lampara' }, CONTEXTO);

    expect(resultado.paraElModelo).toEqual([{ id: 'p1', nombre: 'Lámpara', descripcion_corta: 'De mesa' }]);
  });

  it('R1 — el precio que llegó en la ficha de buscar_producto cuenta como rastro', async () => {
    const resultado = await crearBuscarProducto(buscar, ficha).ejecutar({ query: 'lampara' }, CONTEXTO);

    expect(contarMontosSinRastro('La lámpara cuesta $389.000', [resultado.paraElModelo])).toBe(0);
    expect(contarMontosSinRastro('La lámpara cuesta $400.000', [resultado.paraElModelo])).toBe(1);
  });

  it('la descripción le dice al modelo que con la ficha incluida no hace falta obtener_ficha', () => {
    expect(crearBuscarProducto(buscar, ficha).definicion.descripcion).toMatch(/obtener_ficha/);
  });

  it('AGT16 — Los resultados de las herramientas no contienen SKU (buscar_producto)', async () => {
    const resultado = await crearBuscarProducto(buscar, ficha).ejecutar({ query: 'lampara' }, CONTEXTO);

    expect(JSON.stringify(resultado.paraElModelo)).not.toContain('SKU');
    expect(crearBuscarProducto(buscar, ficha).definicion.descripcion).not.toMatch(/sku/i);
  });

  it('una búsqueda sin resultados devuelve una lista vacía', async () => {
    const herramienta = crearBuscarProducto(buscar, ficha);

    await expect(herramienta.ejecutar({ query: 'zapatos' }, CONTEXTO)).resolves.toMatchObject({ paraElModelo: [] });
  });

  it('su definición es la del contrato: nombre buscar_producto y un query obligatorio', () => {
    const { definicion } = crearBuscarProducto(buscar, ficha);

    expect(definicion.nombre).toBe('buscar_producto');
    expect(definicion.esquema.safeParse({ query: 'anillo' }).success).toBe(true);
    expect(definicion.esquema.safeParse({}).success).toBe(false);
    expect(definicion.esquema.safeParse({ query: '' }).success).toBe(false);
  });
});
