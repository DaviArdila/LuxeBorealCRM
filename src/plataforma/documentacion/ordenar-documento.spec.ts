import type { OpenAPIObject } from '@nestjs/swagger';
import { describe, expect, it } from 'vitest';
import { ordenarDocumento } from './ordenar-documento.js';

function documentoConOrdenInvertido(invertido: boolean): OpenAPIObject {
  const propiedades = invertido
    ? { zeta: { type: 'string' }, alfa: { type: 'integer' } }
    : { alfa: { type: 'integer' }, zeta: { type: 'string' } };
  const esquemas = invertido
    ? { Zeta: { type: 'string' }, Alfa: { type: 'object', properties: propiedades } }
    : { Alfa: { type: 'object', properties: propiedades }, Zeta: { type: 'string' } };
  const rutas = invertido
    ? { '/zeta': { get: { responses: { '200': { description: 'OK' } } } }, '/alfa': {} }
    : { '/alfa': {}, '/zeta': { get: { responses: { '200': { description: 'OK' } } } } };
  const componentes = { schemas: esquemas };
  const info = invertido
    ? { version: '1.0.0', title: 'Contrato de prueba' }
    : { title: 'Contrato de prueba', version: '1.0.0' };
  const documento = {
    ...(invertido ? { zExtension: true, aExtension: true } : { aExtension: true, zExtension: true }),
    ...(invertido
      ? { components: componentes, paths: rutas }
      : { paths: rutas, components: componentes }),
    tags: [{ name: 'zeta' }, { name: 'alfa' }],
    servers: [{ url: '/' }],
    info,
    openapi: '3.1.0',
  };

  return documento;
}

describe('API1 — El orden del documento OpenAPI es determinista', () => {
  it('dos documentos con distinto orden de inserción producen la misma salida', () => {
    const primero = ordenarDocumento(documentoConOrdenInvertido(false));
    const segundo = ordenarDocumento(documentoConOrdenInvertido(true));

    expect(JSON.stringify(primero)).toBe(JSON.stringify(segundo));
    expect(Object.keys(primero)).toEqual([
      'openapi',
      'info',
      'servers',
      'tags',
      'paths',
      'components',
      'aExtension',
      'zExtension',
    ]);
    expect(primero.tags?.map(({ name }) => name)).toEqual(['zeta', 'alfa']);
    const esquemaAlfa = primero.components?.schemas?.Alfa as
      | { readonly properties?: Record<string, unknown> }
      | undefined;
    expect(Object.keys(esquemaAlfa?.properties ?? {})).toEqual(['alfa', 'zeta']);
  });

  it('ordenar un documento ya ordenado no cambia su salida', () => {
    const ordenado = ordenarDocumento(documentoConOrdenInvertido(true));

    expect(JSON.stringify(ordenarDocumento(ordenado))).toBe(JSON.stringify(ordenado));
  });
});
