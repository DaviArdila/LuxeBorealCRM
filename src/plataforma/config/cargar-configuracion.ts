import type { z } from 'zod';
import {
  ConfiguracionInvalidaError,
  esquemaConfiguracion,
  type Configuracion,
  type ProblemaConfiguracion,
  type VariableInvalida,
} from './esquema.js';

/**
 * Clasifica un `ZodIssue` en el tipo de problema que se reporta al exterior (PLT1), sin exponer
 * ningún dato del valor recibido:
 * - `falta`: la variable no vino en la fuente. Zod reporta `invalid_type` sin campo `received`
 *   cuando la clave está ausente (a diferencia de una clave presente con el tipo equivocado, que
 *   sí trae `received`).
 * - `formato`: vino con un tipo o forma que no cumple el esquema (regex, coerción numérica fallida
 *   sobre un valor presente).
 * - `valor`: vino con el tipo correcto pero fuera del conjunto o rango permitido (enum, min/max).
 */
function problemaDeIssue(issue: z.ZodIssue): ProblemaConfiguracion {
  switch (issue.code) {
    case 'invalid_type':
      return 'received' in issue ? 'formato' : 'falta';
    case 'invalid_format':
      return 'formato';
    case 'invalid_value':
    case 'too_big':
    case 'too_small':
      return 'valor';
    default:
      return 'valor';
  }
}

/**
 * Valida `fuente` contra {@link esquemaConfiguracion} (PLT1) y devuelve una {@link Configuracion}
 * congelada (`Object.freeze`). Función pura: no lee `process.env` directamente — quien la llama
 * decide la fuente (producción: `configuracion.module.ts`; tests: un objeto literal).
 *
 * @throws {ConfiguracionInvalidaError} nombrando cada variable inválida y su tipo de problema,
 * nunca el valor recibido.
 */
export function cargarConfiguracion(
  fuente: Readonly<Record<string, string | undefined>>,
): Configuracion {
  const resultado = esquemaConfiguracion.safeParse(fuente);

  if (!resultado.success) {
    const variables: VariableInvalida[] = resultado.error.issues.map((issue) => ({
      nombre: String(issue.path[0]),
      problema: problemaDeIssue(issue),
    }));
    throw new ConfiguracionInvalidaError(variables);
  }

  return Object.freeze(resultado.data);
}
