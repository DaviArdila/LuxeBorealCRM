import type { ProductoResumen } from './producto.js';
import { buscarEnResumen } from './buscar.js';

// Escenarios CAT13 de `openspec/changes/fase-07b-agente-llm-herramientas/specs/catalogo/spec.md`.

function producto(id: string, nombre: string, descripcionCorta = ''): ProductoResumen {
  return { id, sku: `SKU-${id}`, nombre, descripcionCorta };
}

describe('modulos/catalogo/dominio — buscarEnResumen (CAT13)', () => {
  it('CAT13 — Una coincidencia exacta devuelve un solo resultado', () => {
    const catalogo = [producto('1', 'Lámpara de mesa'), producto('2', 'Collar de plata')];

    const resultado = buscarEnResumen(catalogo, 'lámpara');

    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.id).toBe('1');
    expect(Object.keys(resultado[0] as object)).not.toContain('precioCop');
  });

  it('CAT13 — La búsqueda ignora tildes y mayúsculas', () => {
    expect(buscarEnResumen([producto('1', 'Lámpara de mesa')], 'LAMPARA').map((p) => p.id)).toEqual(['1']);
  });

  it('CAT13 — Los productos con más palabras en común van primero', () => {
    const catalogo = [producto('1', 'Mesa de centro'), producto('2', 'Lámpara de mesa roble')];

    expect(buscarEnResumen(catalogo, 'lámpara mesa').map((p) => p.id)).toEqual(['2', '1']);
  });

  it('CAT13 — La búsqueda devuelve como máximo cinco productos', () => {
    const catalogo = Array.from({ length: 7 }, (_, i) => producto(String(i), `Anillo modelo ${String(i)}`));

    expect(buscarEnResumen(catalogo, 'anillo')).toHaveLength(5);
  });

  it('CAT13 — Una búsqueda sin coincidencias devuelve una lista vacía', () => {
    expect(buscarEnResumen([producto('1', 'Lámpara de mesa')], 'zapatos')).toEqual([]);
  });

  it('también busca en la descripción corta', () => {
    const catalogo = [producto('1', 'Anillo Aurora', 'Oro laminado 18k')];

    expect(buscarEnResumen(catalogo, 'laminado').map((p) => p.id)).toEqual(['1']);
  });

  it('un texto sin palabras clave (todas muy cortas) no devuelve nada', () => {
    expect(buscarEnResumen([producto('1', 'Lámpara de mesa')], 'la de')).toEqual([]);
  });

  it('a igual número de coincidencias conserva el orden del catálogo', () => {
    const catalogo = [producto('1', 'Anillo azul'), producto('2', 'Anillo rojo')];

    expect(buscarEnResumen(catalogo, 'anillo').map((p) => p.id)).toEqual(['1', '2']);
  });
});
