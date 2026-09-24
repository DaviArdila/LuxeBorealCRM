import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearAplicacionDeContrato, obtenerServidorDePrueba } from './soporte.js';

interface CuerpoProblema {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly codigo?: string;
  readonly errores?: readonly { readonly campo: string; readonly problema: string }[];
}

describe('API4 — Errores en formato RFC 9457 (T2, fixture de contrato)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await crearAplicacionDeContrato();
  });

  afterEach(async () => {
    await app.close();
  });

  it('API4 — Error de validación en formato problem+json', async () => {
    const respuesta = await request(obtenerServidorDePrueba(app))
      .post('/api/v1/ejemplos')
      .send({ precioCop: 'no-es-un-numero' });
    const cuerpo = respuesta.body as CuerpoProblema;

    expect(respuesta.status).toBe(400);
    expect(respuesta.headers['content-type']).toContain('application/problem+json');
    expect(cuerpo.codigo).toBe('validacion-fallida');
    expect(cuerpo.status).toBe(400);
    expect(Array.isArray(cuerpo.errores)).toBe(true);
    expect((cuerpo.errores ?? []).length).toBeGreaterThan(0);
    // Ningún detalle repite el valor recibido; solo nombra el campo y su tipo de problema.
    expect(JSON.stringify(cuerpo)).not.toContain('no-es-un-numero');
  });

  it('API4 — Error no manejado no filtra detalles internos', async () => {
    const respuesta = await request(obtenerServidorDePrueba(app)).get('/api/v1/ejemplos/falla');
    const cuerpo = respuesta.body as CuerpoProblema;

    expect(respuesta.status).toBe(500);
    expect(respuesta.headers['content-type']).toContain('application/problem+json');
    expect(cuerpo.codigo).toBe('error-interno');
    expect(respuesta.body).not.toHaveProperty('stack');
    expect(JSON.stringify(respuesta.body)).not.toContain('diagnóstico interno secreto');
    expect(JSON.stringify(respuesta.body)).not.toContain('Fallo deliberado');
  });

  it('API4 — El código de error se mantiene estable entre despliegues', async () => {
    const primera = await request(obtenerServidorDePrueba(app)).post('/api/v1/ejemplos').send({});
    const segunda = await request(obtenerServidorDePrueba(app))
      .post('/api/v1/ejemplos')
      .send({ nombre: 123, precioCop: 'x' });

    expect((primera.body as CuerpoProblema).codigo).toBe('validacion-fallida');
    expect((segunda.body as CuerpoProblema).codigo).toBe('validacion-fallida');
    expect((primera.body as CuerpoProblema).status).toBe((segunda.body as CuerpoProblema).status);
  });
});
