import { describe, expect, it } from 'vitest';
import { construirDocumentosContrato } from '../../scripts/generar-contrato.js';

// CFG1 (fase-12, T9): la configuración del negocio en el contrato público, para el cliente generado.

interface Operacion {
  readonly operationId?: string;
  readonly security?: readonly Record<string, readonly string[]>[];
  readonly parameters?: readonly { readonly name: string; readonly in: string; readonly required?: boolean }[];
  readonly responses: Record<string, { readonly content?: Record<string, unknown> }>;
}

const RUTAS: readonly (readonly [string, string, string])[] = [
  ['obtenerHorario', '/api/v1/configuracion/horario', 'get'],
  ['guardarHorario', '/api/v1/configuracion/horario', 'put'],
  ['crearExcepcionHorario', '/api/v1/configuracion/horario/excepciones', 'post'],
  ['borrarExcepcionHorario', '/api/v1/configuracion/horario/excepciones/{fecha}', 'delete'],
  ['obtenerConfiguracionEnvios', '/api/v1/configuracion/envios', 'get'],
  ['guardarConfiguracionEnvios', '/api/v1/configuracion/envios', 'put'],
  ['obtenerGastoLlm', '/api/v1/configuracion/gasto-llm', 'get'],
  ['guardarGastoLlm', '/api/v1/configuracion/gasto-llm', 'put'],
];

async function operaciones(): Promise<Record<string, Operacion | undefined>> {
  const { publico } = await construirDocumentosContrato();
  const paths = (JSON.parse(publico) as { paths: Record<string, Record<string, Operacion>> }).paths;
  return Object.fromEntries(RUTAS.map(([id, ruta, metodo]) => [id, paths[ruta]?.[metodo]]));
}

describe('CFG1 — configuración del negocio en el contrato público', () => {
  it('CFG1 — Las seis operaciones de los tres grupos (y las dos de excepciones) están con su operationId y exigen la cookie', async () => {
    const ops = await operaciones();

    for (const [id] of RUTAS) {
      expect(ops[id]?.operationId, id).toBe(id);
      expect(ops[id]?.security, id).toEqual([{ cookieAuth: [] }]);
      expect(ops[id]?.responses['401']?.content, id).toHaveProperty(['application/problem+json']);
      expect(ops[id]?.responses['403']?.content, id).toHaveProperty(['application/problem+json']);
    }
  });

  it('las mutaciones piden X-Luxe-Csrf y las lecturas no', async () => {
    const ops = await operaciones();

    for (const [id, , metodo] of RUTAS) {
      const pide = ops[id]?.parameters?.some((p) => p.in === 'header' && p.name === 'X-Luxe-Csrf' && p.required === true) ?? false;
      expect(pide, id).toBe(metodo !== 'get');
    }
  });

  it('las escrituras de grupo documentan 422 en problem+json y las excepciones, 409 y 404', async () => {
    const ops = await operaciones();

    for (const id of ['guardarHorario', 'guardarConfiguracionEnvios', 'guardarGastoLlm']) {
      expect(ops[id]?.responses['422']?.content, id).toHaveProperty(['application/problem+json']);
    }
    expect(ops['crearExcepcionHorario']?.responses['409']?.content).toHaveProperty(['application/problem+json']);
    expect(Object.keys(ops['borrarExcepcionHorario']?.responses ?? {})).toContain('204');
    expect(ops['borrarExcepcionHorario']?.responses['404']?.content).toHaveProperty(['application/problem+json']);
  });
});
