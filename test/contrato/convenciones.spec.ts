import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearAplicacionDeContrato, obtenerServidorDePrueba } from './soporte.js';

interface Ejemplo {
  readonly id: string;
  readonly nombre: string;
  readonly precioCop: number;
  readonly creadoEn: string;
}

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGEX_ISO_8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Junta los `operationId` del documento generado, por ruta y método (orden estable por clave). */
function extraerOperationIds(app: INestApplication): Record<string, string | undefined> {
  const documento = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  const operationIds: Record<string, string | undefined> = {};

  for (const [ruta, operaciones] of Object.entries(documento.paths ?? {})) {
    for (const [metodo, operacion] of Object.entries(operaciones ?? {})) {
      if (operacion !== null && typeof operacion === 'object' && 'operationId' in operacion) {
        operationIds[`${metodo.toUpperCase()} ${ruta}`] = (operacion as { operationId?: string }).operationId;
      }
    }
  }

  return operationIds;
}

describe('API2/API3 — convenciones de ruta y de cuerpo JSON (T2, fixture de contrato)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await crearAplicacionDeContrato();
  });

  afterEach(async () => {
    await app.close();
  });

  it('API3 — Dinero como entero, nunca decimal', async () => {
    const respuesta = await request(obtenerServidorDePrueba(app)).get('/api/v1/ejemplos');
    const [ejemplo] = respuesta.body as readonly Ejemplo[];

    expect(respuesta.status).toBe(200);
    expect(Number.isInteger(ejemplo.precioCop)).toBe(true);
  });

  it('API3 — Fecha en ISO 8601 UTC', async () => {
    const respuesta = await request(obtenerServidorDePrueba(app)).get('/api/v1/ejemplos');
    const [ejemplo] = respuesta.body as readonly Ejemplo[];

    expect(ejemplo.creadoEn).toMatch(REGEX_ISO_8601_UTC);
  });

  it('API3 — El id del ejemplo es un UUID', async () => {
    const respuesta = await request(obtenerServidorDePrueba(app)).get('/api/v1/ejemplos');
    const [ejemplo] = respuesta.body as readonly Ejemplo[];

    expect(ejemplo.id).toMatch(REGEX_UUID);
  });

  it('API2 — Ruta con prefijo y nombre de recurso en español', async () => {
    const conPrefijo = await request(obtenerServidorDePrueba(app)).get('/api/v1/ejemplos');
    const sinPrefijo = await request(obtenerServidorDePrueba(app)).get('/ejemplos');

    expect(conPrefijo.status).toBe(200);
    expect(sinPrefijo.status).toBe(404);
  });

  it('API2 — operationId estable entre despliegues', () => {
    const primeraGeneracion = extraerOperationIds(app);
    const segundaGeneracion = extraerOperationIds(app);

    expect(segundaGeneracion).toEqual(primeraGeneracion);
    expect(primeraGeneracion['GET /api/v1/ejemplos']).toBe('listarEjemplos');
    expect(primeraGeneracion['POST /api/v1/ejemplos']).toBe('crearEjemplo');
  });
});
