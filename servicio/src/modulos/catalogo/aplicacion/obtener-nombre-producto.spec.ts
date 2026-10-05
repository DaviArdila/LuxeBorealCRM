import { describe, expect, it } from 'vitest';
import type { Producto } from '../dominio/producto.js';
import type { RepositorioProducto } from '../puertos/repositorio-producto.js';
import { ObtenerNombreProducto } from './obtener-nombre-producto.js';

const PRODUCTO: Producto = {
  id: 'p1',
  sku: 'SKU-GL001',
  nombre: 'Regadera fija con brazo',
  descripcionCorta: 'corta',
  descripcionLarga: 'larga',
  precioCop: 119000,
  activo: true,
  pesoGramos: 500,
  largoMm: null,
  anchoMm: null,
  altoMm: null,
  tieneFotos: true,
};

function repositorioCon(producto: Producto | null): RepositorioProducto {
  return { buscarPorIdOSku: () => Promise.resolve(producto) } as unknown as RepositorioProducto;
}

describe('ObtenerNombreProducto (D6 de la Fase 08d)', () => {
  it('devuelve solo el nombre del producto, nunca su SKU ni su precio', async () => {
    const caso = new ObtenerNombreProducto(repositorioCon(PRODUCTO));

    const nombre = await caso.ejecutar('p1');

    expect(nombre).toBe('Regadera fija con brazo');
    expect(nombre).not.toContain('SKU');
  });

  it('un producto inactivo conserva su nombre: el aviso es para el asesor, no para el cliente', async () => {
    const caso = new ObtenerNombreProducto(repositorioCon({ ...PRODUCTO, activo: false }));

    await expect(caso.ejecutar('p1')).resolves.toBe('Regadera fija con brazo');
  });

  it('un producto que no existe devuelve null', async () => {
    const caso = new ObtenerNombreProducto(repositorioCon(null));

    await expect(caso.ejecutar('no-existe')).resolves.toBeNull();
  });
});
