import { describe, expect, it } from 'vitest';
import { formatearCop } from '../../../compartido/dinero/index.js';
import { armarCatalogoCompacto, armarFicha, armarLeyendaFoto, type Producto, type ProductoResumen } from './producto.js';

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
      const ficha = armarFicha(producto({ precioCop: 123456 }));

      expect(ficha.precioTexto).toBe(formatearCop(123456));
    });

    it('CAT2 — La ficha no expone ningún dato del recargo contra entrega', () => {
      const ficha = armarFicha(producto());

      expect(Object.keys(ficha).join(' ')).not.toMatch(/recargo/i);
      expect(JSON.stringify(ficha)).not.toContain('%');
    });

    it('CAT2 — La ficha indica si el producto tiene fotos', () => {
      const ficha = armarFicha(producto({ tieneFotos: true }));

      expect(ficha.tieneFotos).toBe(true);
    });
  });

  describe('armarLeyendaFoto', () => {
    it('AGT17 — El pie de foto lleva nombre, descripción corta y el precio formateado por el backend', () => {
      const leyenda = armarLeyendaFoto(producto({ nombre: 'Grifo alto', descripcionCorta: 'Cromado', precioCop: 289000 }));

      expect(leyenda).toBe(`Grifo alto — Cromado\n${formatearCop(289000)}`);
    });

    it('AGT17 — El pie de foto no lleva el SKU', () => {
      expect(armarLeyendaFoto(producto({ sku: 'SKU-GL001' }))).not.toContain('SKU');
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
        '- 1: Anillo — anillo corto',
        '- 2: Mesa — mesa corta',
        '- 3: Zapato — zapato corto',
      ]);
      expect(texto).not.toMatch(/\$/);
    });

    it('CAT4 — Cada línea del catálogo compacto lleva el id del producto y no su SKU', () => {
      const productos: ProductoResumen[] = [
        { id: '0190f3a2-0000-7000-8000-000000000001', sku: 'SKU-GL001', nombre: 'Grifo alto', descripcionCorta: 'cromado' },
      ];

      const texto = armarCatalogoCompacto(productos);

      expect(texto).toBe('- 0190f3a2-0000-7000-8000-000000000001: Grifo alto — cromado');
      expect(texto).not.toContain('SKU');
    });
  });
});
