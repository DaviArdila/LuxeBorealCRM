import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  construirDocumentoInterno,
  filtrarDocumentoPublico,
  ordenarDocumento,
  serializarDocumento,
} from '../../src/plataforma/documentacion/index.js';
import { crearAplicacionDeContrato } from './soporte.js';

describe('API1 — SwaggerModule incluye el prefijo global en el documento', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await crearAplicacionDeContrato();
  });

  afterEach(async () => {
    await app.close();
  });

  it('incluye /api/v1/ejemplos con las opciones predeterminadas', () => {
    const documento = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    const rutas = Object.keys(documento.paths ?? {});

    expect(rutas).toContain('/api/v1/ejemplos');
    expect(rutas).not.toContain('/api/v1/api/v1/ejemplos');
  });

  it('API1 — el público conserva rutas públicas y elimina la operación internal', () => {
    const documentoInterno = construirDocumentoInterno(app);
    const documentoPublico = filtrarDocumentoPublico(documentoInterno);

    expect(documentoInterno.paths).toHaveProperty('/api/v1/ejemplos');
    expect(documentoInterno.paths).toHaveProperty('/api/v1/ejemplos/interno');
    expect(documentoPublico.paths).toHaveProperty('/api/v1/ejemplos');
    expect(documentoPublico.paths).not.toHaveProperty('/api/v1/ejemplos/interno');
    expect(documentoInterno.paths).toHaveProperty('/api/v1/ejemplos/interno');
  });

  it('API1 — Generar dos veces sin cambios produce el mismo documento', () => {
    const primera = serializarDocumento(ordenarDocumento(construirDocumentoInterno(app)));
    const segunda = serializarDocumento(ordenarDocumento(construirDocumentoInterno(app)));

    expect(segunda).toBe(primera);
  });
});
