import { describe, expect, it } from 'vitest';
import { construirDocumentosContrato } from '../../scripts/generar-contrato.js';

// API11 (fase-11a, T6): el contrato declara la autenticación por cookie.

interface Operacion {
  readonly operationId?: string;
  readonly security?: readonly Record<string, readonly string[]>[];
  readonly parameters?: readonly { readonly name: string; readonly in: string; readonly required?: boolean }[];
  readonly responses: Record<string, { readonly content?: Record<string, unknown> }>;
}

interface Documento {
  readonly paths: Record<string, Record<string, Operacion>>;
  readonly components: { readonly securitySchemes?: Record<string, unknown> };
}

const MUTACIONES = new Set(['post', 'put', 'patch', 'delete']);

async function documentos(): Promise<{ publico: Documento; interno: Documento }> {
  const generados = await construirDocumentosContrato();
  return { publico: JSON.parse(generados.publico) as Documento, interno: JSON.parse(generados.interno) as Documento };
}

function operaciones(documento: Documento): { ruta: string; metodo: string; operacion: Operacion }[] {
  return Object.entries(documento.paths).flatMap(([ruta, metodos]) =>
    Object.entries(metodos).map(([metodo, operacion]) => ({ ruta, metodo, operacion })),
  );
}

function exigeCsrf(operacion: Operacion): boolean {
  return (operacion.parameters ?? []).some(
    (parametro) => parametro.in === 'header' && parametro.name.toLowerCase() === 'x-luxe-csrf' && parametro.required === true,
  );
}

describe('API11 — El contrato declara la autenticación por cookie', () => {
  it('API11 — El documento público declara `cookieAuth`', async () => {
    const { publico } = await documentos();

    expect(publico.components.securitySchemes?.['cookieAuth']).toEqual({
      type: 'apiKey',
      in: 'cookie',
      name: 'luxe_sesion',
    });
  });

  it('API11 — Una operación protegida exige la cookie en el contrato', async () => {
    const { publico } = await documentos();

    const operacion = publico.paths['/api/v1/auth/yo']?.['get'];

    expect(operacion?.operationId).toBe('obtenerSesionActual');
    expect(operacion?.security).toEqual([{ cookieAuth: [] }]);
    expect(operacion?.responses['401']?.content).toHaveProperty(['application/problem+json']);
  });

  it('API11 — El inicio de sesión es público en el contrato', async () => {
    const { publico } = await documentos();

    const operacion = publico.paths['/api/v1/auth/sesion']?.['post'];

    expect(operacion?.operationId).toBe('iniciarSesion');
    expect(operacion?.security).toEqual([]);
    expect(exigeCsrf(operacion ?? { responses: {} })).toBe(true);
  });

  it('toda operación de /api/v1 declara su seguridad, y toda mutación salvo el webhook exige X-Luxe-Csrf', async () => {
    const { interno } = await documentos();

    const deApi = operaciones(interno).filter(({ ruta }) => ruta.startsWith('/api/v1/'));
    const sinSeguridad = deApi.filter(({ operacion }) => operacion.security === undefined).map(({ ruta }) => ruta);
    const mutacionesSinCsrf = deApi
      .filter(({ metodo, ruta }) => MUTACIONES.has(metodo) && ruta !== '/api/v1/webhooks/chatwoot')
      .filter(({ operacion }) => !exigeCsrf(operacion))
      .map(({ metodo, ruta }) => `${metodo} ${ruta}`);

    expect(deApi.length).toBeGreaterThanOrEqual(4);
    expect(sinSeguridad).toEqual([]);
    expect(mutacionesSinCsrf).toEqual([]);
  });

  it('las respuestas 401 y 403 de las operaciones protegidas van en problem+json', async () => {
    const { interno } = await documentos();

    const protegidas = operaciones(interno).filter(({ operacion }) =>
      (operacion.security ?? []).some((requisito) => 'cookieAuth' in requisito),
    );

    expect(protegidas.length).toBeGreaterThan(0);
    for (const { operacion } of protegidas) {
      expect(operacion.responses['401']?.content).toHaveProperty(['application/problem+json']);
    }
  });
});
