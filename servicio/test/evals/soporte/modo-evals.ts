import { z } from 'zod';
import {
  PROVEEDORES_LLM_REGISTRADOS,
  resolverModelo,
  tieneProveedorRegistrado,
} from '../../../src/compartido/llm/index.js';

/** Error de configuración del arnés de evals; el mensaje nombra la variable, nunca su valor. */
export class ErrorModoEvals extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorModoEvals';
  }
}

/** Variable de entorno con la clave de cada proveedor de LLM registrado (LLM17). */
const VARIABLE_DE_CLAVE: Readonly<Record<string, string>> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

export type ModoEvals = { readonly modo: 'guionado' } | { readonly modo: 'real' };

const esquemaEntorno = z.object({
  EVALS_MODO: z.enum(['guionado', 'real']).default('guionado'),
  OPENAI_API_KEY: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
  LLM_EVALS_MODELOS: z.string().default('openai:gpt-5.6-luna'),
  CI: z.string().optional(),
});

/**
 * Modo del arnés (D6 de la Fase 07c, EVL1/EVL4). Guionado por defecto: sin red ni costo. El modo real
 * solo arranca si se pidió con `EVALS_MODO=real`, no se está en CI y hay clave de cada proveedor que
 * usan los modelos de `LLM_EVALS_MODELOS` (LLM17, ADR-0029: `openai:` pide `OPENAI_API_KEY` y
 * `anthropic:` pide `ANTHROPIC_API_KEY`; un id sin prefijo registrado se niega, LLM26); si no, falla
 * aquí, antes de componer la aplicación, así que nunca hay una llamada. Los mensajes nombran la variable, nunca su valor.
 */
export function leerModoEvals(entorno: Readonly<Record<string, string | undefined>>): ModoEvals {
  const leido = esquemaEntorno.safeParse(entorno);
  if (!leido.success) {
    throw new ErrorModoEvals('EVALS_MODO MUST ser "guionado" o "real".');
  }
  const { EVALS_MODO, CI, LLM_EVALS_MODELOS } = leido.data;
  if (EVALS_MODO === 'guionado') {
    return { modo: 'guionado' };
  }
  if (CI === 'true' || CI === '1') {
    throw new ErrorModoEvals('El modo real de las evals no corre en CI (variable CI activa): cuesta dinero.');
  }
  const modelos = LLM_EVALS_MODELOS.split(',')
    .map((modelo) => modelo.trim())
    .filter((modelo) => modelo.length > 0);
  if (!modelos.every((modelo) => tieneProveedorRegistrado(modelo, PROVEEDORES_LLM_REGISTRADOS))) {
    throw new ErrorModoEvals('LLM_EVALS_MODELOS MUST usar ids proveedor:modelo con un proveedor registrado (LLM26).');
  }
  const proveedores = new Set(modelos.map((modelo) => resolverModelo(modelo, PROVEEDORES_LLM_REGISTRADOS).proveedor));
  for (const proveedor of proveedores) {
    const variable = VARIABLE_DE_CLAVE[proveedor];
    const clave = variable === undefined ? undefined : leido.data[variable as 'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY'];
    if (variable !== undefined && (clave ?? '').trim().length === 0) {
      throw new ErrorModoEvals(`El modo real necesita ${variable} con la clave del usuario; no se hizo ninguna llamada.`);
    }
  }
  return { modo: 'real' };
}
