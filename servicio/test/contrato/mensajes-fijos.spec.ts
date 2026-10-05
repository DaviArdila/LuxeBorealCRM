import { describe, expect, it } from 'vitest';
import { construirDocumentosContrato } from '../../scripts/generar-contrato.js';

// CFN1 y CFN2 (fase-11b, T4): los mensajes fijos en el contrato público, para el cliente generado.

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
    listarMensajesFijos: paths['/api/v1/mensajes-fijos']?.['get'],
    guardarMensajeFijo: paths['/api/v1/mensajes-fijos/{clave}']?.['put'],
  };
}

describe('CFN1/CFN2 — los mensajes fijos en el contrato público', () => {
  it('las dos operaciones existen con su operationId, exigen la cookie y documentan 401 y 403 en problem+json', async () => {
    const ops = await operaciones();

    for (const [id, operacion] of Object.entries(ops)) {
      expect(operacion?.operationId, id).toBe(id);
      expect(operacion?.security, id).toEqual([{ cookieAuth: [] }]);
      expect(operacion?.responses['401']?.content, id).toHaveProperty(['application/problem+json']);
      expect(operacion?.responses['403']?.content, id).toHaveProperty(['application/problem+json']);
    }
  });

  it('guardarMensajeFijo pide X-Luxe-Csrf, la clave en la ruta y documenta 400, 404 y 422 en problem+json', async () => {
    const operacion = (await operaciones())['guardarMensajeFijo'];

    expect(operacion?.parameters?.some((p) => p.in === 'header' && p.name === 'X-Luxe-Csrf' && p.required === true)).toBe(true);
    expect(operacion?.parameters?.some((p) => p.in === 'path' && p.name === 'clave' && p.required === true)).toBe(true);
    for (const estado of ['400', '404', '422']) {
      expect(operacion?.responses[estado]?.content, estado).toHaveProperty(['application/problem+json']);
    }
  });

  it('listarMensajesFijos no pide el encabezado anti-CSRF', async () => {
    const operacion = (await operaciones())['listarMensajesFijos'];

    expect(operacion?.parameters?.some((p) => p.name === 'X-Luxe-Csrf') ?? false).toBe(false);
  });

  it('el cuerpo de guardarMensajeFijo es { texto } y la respuesta de la lista trae clave, descripcion, texto, origen y actualizado', async () => {
    const ops = await operaciones();

    const cuerpo = ops['guardarMensajeFijo']?.requestBody?.content['application/json']?.schema as { required?: string[]; properties?: Record<string, unknown> };
    const lista = (ops['listarMensajesFijos']?.responses['200']?.content?.['application/json'] as { schema?: { properties?: { mensajes?: { items?: { properties?: Record<string, unknown> } } } } }).schema;

    expect(cuerpo.required).toEqual(['texto']);
    expect(Object.keys(lista?.properties?.mensajes?.items?.properties ?? {}).sort()).toEqual(
      ['actualizado', 'clave', 'descripcion', 'origen', 'texto'],
    );
  });
});
