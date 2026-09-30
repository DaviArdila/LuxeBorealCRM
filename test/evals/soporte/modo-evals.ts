import { z } from 'zod';

/** Error de configuración del arnés de evals; el mensaje nombra la variable, nunca su valor. */
export class ErrorModoEvals extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorModoEvals';
  }
}

export type ModoEvals = { readonly modo: 'guionado' } | { readonly modo: 'real' };

const esquemaEntorno = z.object({
  EVALS_MODO: z.enum(['guionado', 'real']).default('guionado'),
  OPENROUTER_API_KEY: z.string().default(''),
  CI: z.string().optional(),
});

/**
 * Modo del arnés (D6 de la Fase 07c, EVL1/EVL4). Guionado por defecto: sin red ni costo. El modo real
 * solo arranca si se pidió con `EVALS_MODO=real`, hay clave de OpenRouter y no se está en CI; si no,
 * falla aquí, antes de componer la aplicación, así que nunca hay una llamada.
 */
export function leerModoEvals(entorno: Readonly<Record<string, string | undefined>>): ModoEvals {
  const leido = esquemaEntorno.safeParse(entorno);
  if (!leido.success) {
    throw new ErrorModoEvals('EVALS_MODO MUST ser "guionado" o "real".');
  }
  const { EVALS_MODO, OPENROUTER_API_KEY, CI } = leido.data;
  if (EVALS_MODO === 'guionado') {
    return { modo: 'guionado' };
  }
  if (CI === 'true' || CI === '1') {
    throw new ErrorModoEvals('El modo real de las evals no corre en CI (variable CI activa): cuesta dinero.');
  }
  if (OPENROUTER_API_KEY.trim().length === 0) {
    throw new ErrorModoEvals('El modo real necesita OPENROUTER_API_KEY con la clave del usuario; no se hizo ninguna llamada.');
  }
  return { modo: 'real' };
}
