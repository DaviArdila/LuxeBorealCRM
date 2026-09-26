import { describe, expect, it } from 'vitest';
import { formatearCop, formatearRecargoContraentrega } from '../../../compartido/dinero/index.js';
import { armarCatalogoCompacto, armarFicha, type Producto, type ProductoResumen } from './producto.js';

function producto(sobrescribir: Partial<Producto> = {}): Producto {
  return {
    id: 'prod-1',
    sku: 'SKU-1',
    nombre: 'Producto de prueba',
    descripcionCorta: 'descripción corta',
    descripcionLarga: 'descripción larga',
    precioCop: 123456,
    activo: true,
    pesoGramos: null,
    largoMm: null,
    anchoMm: null,
    altoMm: null,
    tieneFotos: false,
    ...sobrescribir,
  };
}

describe('catalogo/dominio/producto', () => {
  describe('armarFicha', () => {
    it('CAT2 — La ficha expone el precio como texto formateado', () => {
      const ficha = armarFicha(producto({ precioCop: 123456 }), 0);

      expect(ficha.precioTexto).toBe(formatearCop(123456));
    });

    it('CAT2 — La ficha expone el recargo contraentrega leído del parámetro del negocio', () => {
      const ficha = armarFicha(producto(), 5);

      expect(ficha.recargoContraentregaTexto).toBe(formatearRecargoContraentrega(5));
    });

    it('CAT2 — La ficha indica si el producto tiene fotos', () => {
      const ficha = armarFicha(producto({ tieneFotos: true }), 0);

      expect(ficha.tieneFotos).toBe(true);
    });
  });

  describe('armarCatalogoCompacto', () => {
    it('CAT4 — El catálogo compacto no lleva precios y solo lista productos activos ordenados por nombre', () => {
      const productos: ProductoResumen[] = [
        { id: '3', sku: 'SKU-Z', nombre: 'Zapato', descripcionCorta: 'zapato corto' },
        { id: '1', sku: 'SKU-A', nombre: 'Anillo', descripcionCorta: 'anillo corto' },
        { id: '2', sku: 'SKU-M', nombre: 'Mesa', descripcionCorta: 'mesa corta' },
      ];

      const texto = armarCatalogoCompacto(productos);

      expect(texto.split('\n')).toEqual([
        '- SKU-A: Anillo — anillo corto',
        '- SKU-M: Mesa — mesa corta',
        '- SKU-Z: Zapato — zapato corto',
      ]);
      expect(texto).not.toMatch(/\$/);
    });
  });
});
