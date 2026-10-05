import type { OpenAPIObject } from '@nestjs/swagger';
import { describe, expect, it } from 'vitest';
import { filtrarDocumentoPublico } from './filtrar-documento-publico.js';

const documentoInterno = {
  openapi: '3.1.0',
  info: { title: 'Contrato de prueba', version: '1.0.0' },
  paths: {
    '/publico': {
      get: {
        tags: ['publico'],
        operationId: 'listarPublico',
        responses: {
          '200': {
            description: 'Correcto',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Publico' },
              },
            },
          },
        },
      },
    },
    '/interno': {
      get: {
        tags: ['internal'],
        operationId: 'obtenerInterno',
        responses: {
          '200': {
            description: 'Correcto',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Interno' },
              },
            },
          },
        },
      },
    },
    '/mixto': {
      get: {
        tags: ['publico'],
        operationId: 'listarMixto',
        responses: { '200': { description: 'Correcto' } },
      },
      post: {
        tags: ['internal'],
        operationId: 'crearMixto',
        responses: { '200': { description: 'Correcto' } },
      },
    },
  },
  tags: [{ name: 'publico' }, { name: 'internal' }],
  components: {
    schemas: {
      Publico: {
        type: 'object',
        properties: { detalle: { $ref: '#/components/schemas/Detalle' } },
      },
      Detalle: { type: 'string' },
      Interno: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
      Huerfano: { type: 'string' },
    },
  },
} satisfies OpenAPIObject;

describe('API1 — El documento público se deriva del interno en una sola generación', () => {
  it('elimina operaciones internal, paths vacíos, la etiqueta y esquemas no referenciados', () => {
    const original = structuredClone(documentoInterno);

    const documentoPublico = filtrarDocumentoPublico(documentoInterno);

    expect(documentoPublico.paths).toHaveProperty('/publico');
    expect(documentoPublico.paths).not.toHaveProperty('/interno');
    expect(documentoPublico.paths?.['/mixto']).toHaveProperty('get');
    expect(documentoPublico.paths?.['/mixto']).not.toHaveProperty('post');
    expect(documentoPublico.tags?.map(({ name }) => name)).toEqual(['publico']);
    expect(Object.keys(documentoPublico.components?.schemas ?? {}).sort()).toEqual([
      'Detalle',
      'Publico',
    ]);
    expect(documentoInterno).toEqual(original);
  });
});
