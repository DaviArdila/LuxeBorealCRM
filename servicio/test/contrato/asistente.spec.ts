import { describe, expect, it } from 'vitest';
import { construirDocumentosContrato } from '../../scripts/generar-contrato.js';

// CAS9 (fase-12, T7/T8): categorías y casos del asistente en el contrato público, para el cliente generado.

interface Operacion {
  readonly operationId?: string;
  readonly security?: readonly Record<string, readonly string[]>[];
  readonly parameters?: readonly { readonly name: string; readonly in: string; readonly required?: boolean }[];
  readonly requestBody?: { readonly content: Record<string, { readonly schema?: Record<string, unknown> }> };
  readonly responses: Record<string, { readonly content?: Record<string, unknown> }>;
}

const RUTAS: readonly (readonly [string, string, string])[] = [
  ['listarCategoriasCaso', '/api/v1/asistente/categorias', 'get'],
  ['crearCategoriaCaso', '/api/v1/asistente/categorias', 'post'],
  ['renombrarCategoriaCaso', '/api/v1/asistente/categorias/{id}', 'patch'],
  ['ordenarCategoriasCaso', '/api/v1/asistente/categorias/orden', 'put'],
  ['borrarCategoriaCaso', '/api/v1/asistente/categorias/{id}', 'delete'],
  ['listarCasos', '/api/v1/asistente/casos', 'get'],
  ['crearCaso', '/api/v1/asistente/casos', 'post'],
  ['obtenerCaso', '/api/v1/asistente/casos/{id}', 'get'],
  ['editarCaso', '/api/v1/asistente/casos/{id}', 'patch'],
  ['borrarCaso', '/api/v1/asistente/casos/{id}', 'delete'],
];

async function operaciones(): Promise<Record<string, Operacion | undefined>> {
  const { publico } = await construirDocumentosContrato();
  const paths = (JSON.parse(publico) as { paths: Record<string, Record<string, Operacion>> }).paths;
  return Object.fromEntries(RUTAS.map(([id, ruta, metodo]) => [id, paths[ruta]?.[metodo]]));
}

describe('CAS9 — categorías y casos del asistente en el contrato público', () => {
  it('CAS9 — Las diez operaciones están en el contrato con su operationId, exigen la cookie y documentan 401 y 403', async () => {
    const ops = await operaciones();

    for (const [id] of RUTAS) {
      const operacion = ops[id];
      expect(operacion?.operationId, id).toBe(id);
      expect(operacion?.security, id).toEqual([{ cookieAuth: [] }]);
      expect(operacion?.responses['401']?.content, id).toHaveProperty(['application/problem+json']);
      expect(operacion?.responses['403']?.content, id).toHaveProperty(['application/problem+json']);
    }
  });

  it('las mutaciones piden X-Luxe-Csrf y las lecturas no', async () => {
    const ops = await operaciones();

    for (const [id, , metodo] of RUTAS) {
      const pide = ops[id]?.parameters?.some((p) => p.in === 'header' && p.name === 'X-Luxe-Csrf' && p.required === true) ?? false;
      expect(pide, id).toBe(metodo !== 'get');
    }
  });

  it('las operaciones con identificador piden `id` en la ruta y documentan 404 y 400 en problem+json', async () => {
    const ops = await operaciones();

    for (const id of ['renombrarCategoriaCaso', 'borrarCategoriaCaso', 'obtenerCaso', 'editarCaso', 'borrarCaso']) {
      expect(ops[id]?.parameters?.some((p) => p.in === 'path' && p.name === 'id' && p.required === true), id).toBe(true);
      expect(ops[id]?.responses['404']?.content, id).toHaveProperty(['application/problem+json']);
      expect(ops[id]?.responses['400']?.content, id).toHaveProperty(['application/problem+json']);
    }
  });

  it('CAS10 — listarCasos acepta q, categoriaId, disparador, activo, cursor y limite como parámetros de consulta explícitos', async () => {
    const consulta = (await operaciones())['listarCasos']?.parameters?.filter((p) => p.in === 'query').map((p) => p.name).sort();

    expect(consulta).toEqual(['activo', 'categoriaId', 'cursor', 'disparador', 'limite', 'q']);
  });

  it('los borrados responden 204 y las altas 201', async () => {
    const ops = await operaciones();

    expect(Object.keys(ops['borrarCaso']?.responses ?? {})).toContain('204');
    expect(Object.keys(ops['borrarCategoriaCaso']?.responses ?? {})).toContain('204');
    expect(Object.keys(ops['crearCaso']?.responses ?? {})).toContain('201');
    expect(Object.keys(ops['crearCategoriaCaso']?.responses ?? {})).toContain('201');
  });

  it('crearCaso y editarCaso documentan 409 y 422 en problem+json; editarCaso exige `actualizado`', async () => {
    const ops = await operaciones();

    for (const id of ['crearCaso', 'editarCaso']) {
      for (const estado of ['409', '422']) {
        expect(ops[id]?.responses[estado]?.content, `${id} ${estado}`).toHaveProperty(['application/problem+json']);
      }
    }
    const cuerpo = ops['editarCaso']?.requestBody?.content['application/json']?.schema as { required?: string[] };
    expect(cuerpo.required).toEqual(['actualizado']);
  });

  it('la respuesta de listarCasos trae items y siguienteCursor, y cada caso la fecha `actualizado`', async () => {
    const ops = await operaciones();

    const pagina = (ops['listarCasos']?.responses['200']?.content?.['application/json'] as { schema?: { properties?: { items?: { items?: { properties?: Record<string, unknown> } }; siguienteCursor?: unknown } } }).schema;

    expect(Object.keys(pagina?.properties ?? {}).sort()).toEqual(['items', 'siguienteCursor']);
    expect(Object.keys(pagina?.properties?.items?.items?.properties ?? {})).toContain('actualizado');
  });
});
