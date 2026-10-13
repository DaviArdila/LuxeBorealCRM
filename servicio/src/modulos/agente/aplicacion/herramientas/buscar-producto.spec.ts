import { ProductoNoDisponible, type BuscarProductos, type FichaProducto, type ObtenerFichaProducto } from '../../../catalogo/index.js';
import { contarMontosSinRastro } from '../../dominio/auditar-dinero.js';
import { crearBuscarProducto, FICHAS_POR_BUSQUEDA } from './buscar-producto.js';
import { crearObtenerFicha } from './obtener-ficha.js';

// AGT8 (buscar_producto): hasta 5 resultados {id, nombre, descripcion_corta}, sin SKU (AGT16); los primeros 3
// traen la ficha de obtener_ficha en `ficha`.

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
            : texto === 'aretes'
              ? ['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => ({ id, sku: `SKU-${id}`, nombre: `Arete ${id}`, descripcionCorta: 'Oro' }))
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
      return Promise.resolve({ ...FICHA, id, sku: `SKU-${id}` });
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

  it('AGT8 — buscar_producto con varios resultados trae la ficha de cada uno de los primeros 3', async () => {
    const resultado = await crearBuscarProducto(buscar, ficha).ejecutar({ query: 'collar' }, CONTEXTO);
    const p2 = await crearObtenerFicha(ficha).ejecutar({ id_producto: 'p2' }, CONTEXTO);
    const p3 = await crearObtenerFicha(ficha).ejecutar({ id_producto: 'p3' }, CONTEXTO);

    expect(resultado.paraElModelo).toEqual([
      { id: 'p2', nombre: 'Collar Luna', descripcion_corta: 'Plata', ficha: p2.paraElModelo },
      { id: 'p3', nombre: 'Collar Sol', descripcion_corta: 'Oro', ficha: p3.paraElModelo },
    ]);
  });

  it('AGT8 — buscar_producto con más de 3 resultados no trae ficha del cuarto en adelante', async () => {
    const resultado = await crearBuscarProducto(buscar, ficha).ejecutar({ query: 'aretes' }, CONTEXTO);
    const resultados = resultado.paraElModelo as Record<string, unknown>[];

    expect(resultados.map((r) => 'ficha' in r)).toEqual([true, true, true, false, false]);
    expect(resultados[3]).toEqual({ id: 'a4', nombre: 'Arete a4', descripcion_corta: 'Oro' });
    expect(consultadas).toEqual(['a1', 'a2', 'a3']);
    expect(FICHAS_POR_BUSQUEDA).toBe(3);
  });

  it('las fichas de los primeros resultados se leen en paralelo', async () => {
    const pedidas: string[] = [];
    let liberar: () => void = () => undefined;
    const bloqueada = new Promise<void>((resolver) => (liberar = resolver));
    const lenta = {
      ejecutar: (id: string) => (pedidas.push(id), bloqueada.then(() => ({ ...FICHA, id }))),
    } as unknown as ObtenerFichaProducto;

    const resultado = crearBuscarProducto(buscar, lenta).ejecutar({ query: 'aretes' }, CONTEXTO);
    await new Promise((resolver) => setImmediate(resolver));

    expect(pedidas).toEqual(['a1', 'a2', 'a3']);
    liberar();
    await expect(resultado).resolves.toBeDefined();
  });

  it('si falla la ficha de un resultado, solo ese sale sin ella', async () => {
    const parcial = {
      ejecutar: (id: string) => (id === 'a2' ? Promise.reject(new ProductoNoDisponible()) : Promise.resolve({ ...FICHA, id })),
    } as unknown as ObtenerFichaProducto;

    const resultado = await crearBuscarProducto(buscar, parcial).ejecutar({ query: 'aretes' }, CONTEXTO);

    expect((resultado.paraElModelo as Record<string, unknown>[]).map((r) => 'ficha' in r)).toEqual([true, false, true, false, false]);
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
