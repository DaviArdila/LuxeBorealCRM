import { parsearCsv } from './csv.js';

// Soporte de IMP1 (openspec/changes/fase-03-importador-medios/specs/catalogo/spec.md), sin id
// propio de escenario: cubre la amenaza de la matriz de amenazas de esta fase ("CSV con campos
// maliciosamente formateados") — `csv-parse` (D10) en vez de un `split` manual que cortaría mal
// una fila con comas o comillas dentro de un campo entrecomillado.

describe('modulos/catalogo/infraestructura/csv (parsearCsv)', () => {
  it('parsea filas simples con la primera línea como cabecera', () => {
    const filas = parsearCsv('sku,nombre,precio\nSKU-0001,Alfombra clásica,89000\n');

    expect(filas).toEqual([{ sku: 'SKU-0001', nombre: 'Alfombra clásica', precio: '89000' }]);
  });

  it('un campo entrecomillado con una coma embebida no corta la fila en dos columnas', () => {
    const filas = parsearCsv(
      'sku,nombre,descripcion_larga\nSKU-0002,"Banco, de madera",Descripción sin comillas\n',
    );

    expect(filas).toEqual([
      { sku: 'SKU-0002', nombre: 'Banco, de madera', descripcion_larga: 'Descripción sin comillas' },
    ]);
  });

  it('una comilla doble escapada dentro de un campo entrecomillado se conserva literal', () => {
    const filas = parsearCsv(
      'sku,descripcion_larga\nSKU-0003,"Cojín ""premium"" de lino"\n',
    );

    expect(filas).toEqual([{ sku: 'SKU-0003', descripcion_larga: 'Cojín "premium" de lino' }]);
  });

  it('dos filas de datos producen dos objetos, cada uno con las claves de la cabecera', () => {
    const filas = parsearCsv('sku,nombre\nSKU-0001,Alfombra\nSKU-0002,Banco\n');

    expect(filas).toHaveLength(2);
    expect(filas[1]).toEqual({ sku: 'SKU-0002', nombre: 'Banco' });
  });
});
