import type { BuscarProductos } from '../../../catalogo/index.js';
import { crearBuscarProducto } from './buscar-producto.js';

// AGT8 (buscar_producto): hasta 5 resultados {id, nombre, descripcion_corta}, sin dinero ni SKU (AGT16).

const CONTEXTO = { sesion: { conversacionId: 'c', version: 0 }, contactoId: 'k', efectosPrevios: [] };

describe('modulos/agente/aplicacion/herramientas — buscar_producto', () => {
  const buscar = {
    ejecutar: (texto: string) =>
      Promise.resolve(
        texto === 'lampara'
          ? [{ id: 'p1', sku: 'SKU-1', nombre: 'Lámpara', descripcionCorta: 'De mesa' }]
          : [],
      ),
  } as unknown as BuscarProductos;

  it('AGT8 — devuelve los productos en el formato del contrato con el modelo, sin dinero', async () => {
    const herramienta = crearBuscarProducto(buscar);

    const resultado = await herramienta.ejecutar({ query: 'lampara' }, CONTEXTO);

    expect(resultado.paraElModelo).toEqual([{ id: 'p1', nombre: 'Lámpara', descripcion_corta: 'De mesa' }]);
    expect(resultado.efectos).toEqual([]);
  });

  it('AGT16 — Los resultados de las herramientas no contienen SKU (buscar_producto)', async () => {
    const resultado = await crearBuscarProducto(buscar).ejecutar({ query: 'lampara' }, CONTEXTO);

    expect(JSON.stringify(resultado.paraElModelo)).not.toContain('SKU');
    expect(crearBuscarProducto(buscar).definicion.descripcion).not.toMatch(/sku/i);
  });

  it('una búsqueda sin resultados devuelve una lista vacía', async () => {
    const herramienta = crearBuscarProducto(buscar);

    await expect(herramienta.ejecutar({ query: 'zapatos' }, CONTEXTO)).resolves.toMatchObject({ paraElModelo: [] });
  });

  it('su definición es la del contrato: nombre buscar_producto y un query obligatorio', () => {
    const { definicion } = crearBuscarProducto(buscar);

    expect(definicion.nombre).toBe('buscar_producto');
    expect(definicion.esquema.safeParse({ query: 'anillo' }).success).toBe(true);
    expect(definicion.esquema.safeParse({}).success).toBe(false);
    expect(definicion.esquema.safeParse({ query: '' }).success).toBe(false);
  });
});
