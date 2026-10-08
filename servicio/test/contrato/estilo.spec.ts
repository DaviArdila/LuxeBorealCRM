import { describe, expect, it } from 'vitest';
import { construirDocumentosContrato } from '../../scripts/generar-contrato.js';

// AGT23 (fase-11b, T2): las operaciones del estilo del bot en el contrato público, para el cliente generado.

interface Operacion {
  readonly operationId?: string;
  readonly security?: readonly Record<string, readonly string[]>[];
  readonly parameters?: readonly { readonly name: string; readonly in: string; readonly required?: boolean }[];
  readonly requestBody?: { readonly content: Record<string, { readonly schema?: Record<string, unknown> }> };
  readonly responses: Record<string, { readonly content?: Record<string, unknown> }>;
}

async function operaciones(): Promise<Record<string, Operacion | undefined>> {
  const { publico } = await construirDocumentosContrato();
  const paths = (JSON.parse(publico) as { paths: Record<string, Record<string, Operacion>> }).paths;
  return {
    obtenerEstilo: paths['/api/v1/agente/estilo']?.['get'],
    publicarEstilo: paths['/api/v1/agente/estilo']?.['put'],
    listarHistorialEstilo: paths['/api/v1/agente/estilo/historial']?.['get'],
    restaurarEstilo: paths['/api/v1/agente/estilo/restauraciones']?.['post'],
  };
}

describe('AGT23 — el estilo del bot en el contrato público', () => {
  it('las cuatro operaciones existen con su operationId y exigen la cookie', async () => {
    const ops = await operaciones();

    for (const [id, operacion] of Object.entries(ops)) {
      expect(operacion?.operationId, id).toBe(id);
      expect(operacion?.security, id).toEqual([{ cookieAuth: [] }]);
      expect(operacion?.responses['401']?.content, id).toHaveProperty(['application/problem+json']);
      expect(operacion?.responses['403']?.content, id).toHaveProperty(['application/problem+json']);
    }
  });

  it('las mutaciones piden X-Luxe-Csrf y documentan su 400 y los errores de negocio en problem+json', async () => {
    const ops = await operaciones();

    for (const id of ['publicarEstilo', 'restaurarEstilo'] as const) {
      const operacion = ops[id];
      expect(operacion?.parameters?.some((p) => p.in === 'header' && p.name === 'X-Luxe-Csrf' && p.required === true), id).toBe(true);
      expect(operacion?.responses['400']?.content, id).toHaveProperty(['application/problem+json']);
      expect(operacion?.responses['422']?.content, id).toHaveProperty(['application/problem+json']);
    }
    expect(ops['restaurarEstilo']?.responses['404']?.content).toHaveProperty(['application/problem+json']);
  });

  it('las lecturas no piden el encabezado anti-CSRF', async () => {
    const ops = await operaciones();

    for (const id of ['obtenerEstilo', 'listarHistorialEstilo'] as const) {
      expect(ops[id]?.parameters?.some((p) => p.name === 'X-Luxe-Csrf') ?? false, id).toBe(false);
    }
  });

  it('el cuerpo de publicarEstilo limita el texto a 10000 caracteres y el de restaurarEstilo pide una versión entera', async () => {
    const ops = await operaciones();

    const publicar = ops['publicarEstilo']?.requestBody?.content['application/json']?.schema as { properties?: { texto?: { maxLength?: number } } };
    const restaurar = ops['restaurarEstilo']?.requestBody?.content['application/json']?.schema as { properties?: { version?: { type?: string; minimum?: number } } };

    expect(publicar.properties?.texto?.maxLength).toBe(10000);
    expect(restaurar.properties?.version).toMatchObject({ type: 'integer', minimum: 1 });
  });
});
