import type { OpenAPIObject } from '@nestjs/swagger';
import { describe, expect, it } from 'vitest';
import { serializarDocumento } from './serializar-documento.js';

const documento = {
  openapi: '3.1.0',
  info: { title: 'Contrato de prueba', version: '1.0.0' },
  paths: {},
} satisfies OpenAPIObject;

describe('API1 — La serialización del contrato tiene formato fijo', () => {
  it('usa dos espacios, termina con LF y no contiene CR', () => {
    const serializado = serializarDocumento(documento);

    expect(serializado).toBe(`${JSON.stringify(documento, null, 2)}\n`);
    expect(serializado.startsWith('{\n  "openapi"')).toBe(true);
    expect(serializado.endsWith('\n')).toBe(true);
    expect(serializado).not.toContain('\r');
    expect(JSON.parse(serializado)).toEqual(documento);
  });
});
