import type { ObtenerFichaProducto } from '../../../catalogo/index.js';
import { ProductoNoDisponible } from '../../../catalogo/index.js';
import { formatearCop } from '../../../../compartido/dinero/index.js';
import { crearObtenerFicha } from './obtener-ficha.js';

// Escenarios AGT8 de `obtener_ficha` y R2: el precio llega ya formateado por el backend.

const CONTEXTO = { sesion: { conversacionId: 'c', version: 0 }, contactoId: 'k', efectosPrevios: [] };

describe('modulos/agente/aplicacion/herramientas — obtener_ficha', () => {
  it('AGT8 — obtener_ficha devuelve el precio ya formateado', async () => {
    const ficha = {
      ejecutar: () =>
        Promise.resolve({
          id: 'p1',
          sku: 'SKU-1',
          nombre: 'Anillo Aurora',
          descripcionLarga: 'Oro laminado',
          precioTexto: formatearCop(389000),
          tieneFotos: true,
        }),
    } as unknown as ObtenerFichaProducto;

    const resultado = await crearObtenerFicha(ficha).ejecutar({ id_producto: 'SKU-1' }, CONTEXTO);

    expect(resultado.paraElModelo).toEqual({
      id: 'p1',
      nombre: 'Anillo Aurora',
      descripcion_larga: 'Oro laminado',
      precio_texto: formatearCop(389000),
      tiene_fotos: true,
    });
    expect(JSON.stringify(resultado.paraElModelo)).not.toContain('389000');
  });

  it('AGT16 — Los resultados de las herramientas no contienen SKU (obtener_ficha)', async () => {
    const ficha = {
      ejecutar: () =>
        Promise.resolve({ id: 'p1', sku: 'SKU-1', nombre: 'Anillo', descripcionLarga: 'Oro', precioTexto: '$1', tieneFotos: true }),
    } as unknown as ObtenerFichaProducto;
    const herramienta = crearObtenerFicha(ficha);

    const resultado = await herramienta.ejecutar({ id_producto: 'p1' }, CONTEXTO);

    expect(JSON.stringify(resultado.paraElModelo)).not.toContain('SKU');
    expect(herramienta.definicion.descripcion).not.toMatch(/sku/i);
  });

  it('AGT16 — Un SKU como entrada sigue funcionando', async () => {
    const consultados: string[] = [];
    const ficha = {
      ejecutar: (idOSku: string) => {
        consultados.push(idOSku);
        return Promise.resolve({ id: 'p1', sku: 'SKU-1', nombre: 'Anillo', descripcionLarga: 'Oro', precioTexto: '$1', tieneFotos: true });
      },
    } as unknown as ObtenerFichaProducto;

    const resultado = await crearObtenerFicha(ficha).ejecutar({ id_producto: 'SKU-1' }, CONTEXTO);

    expect(consultados).toEqual(['SKU-1']);
    expect(resultado.paraElModelo).toMatchObject({ id: 'p1', nombre: 'Anillo' });
  });

  it('AGT8 — obtener_ficha de un producto inactivo devuelve un error explícito', async () => {
    const ficha = {
      ejecutar: () => Promise.reject(new ProductoNoDisponible()),
    } as unknown as ObtenerFichaProducto;

    const resultado = await crearObtenerFicha(ficha).ejecutar({ id_producto: 'p-inactivo' }, CONTEXTO);

    expect(resultado.paraElModelo).toEqual({
      error: expect.stringContaining('buscar_producto') as unknown,
    });
    expect(Object.keys(resultado.paraElModelo as object)).toEqual(['error']);
  });

  it('un fallo distinto de producto no disponible se propaga al bucle', async () => {
    const ficha = { ejecutar: () => Promise.reject(new Error('base caída')) } as unknown as ObtenerFichaProducto;

    await expect(crearObtenerFicha(ficha).ejecutar({ id_producto: 'p1' }, CONTEXTO)).rejects.toThrow('base caída');
  });

  it('su definición es la del contrato: nombre obtener_ficha y un id_producto obligatorio', () => {
    const { definicion } = crearObtenerFicha({} as ObtenerFichaProducto);

    expect(definicion.nombre).toBe('obtener_ficha');
    expect(definicion.esquema.safeParse({ id_producto: 'x' }).success).toBe(true);
    expect(definicion.esquema.safeParse({}).success).toBe(false);
  });
});
