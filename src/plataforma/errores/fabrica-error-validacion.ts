import type { DetalleCampo } from './construir-problema.js';
import { ErrorDeAplicacion } from './error-de-aplicacion.js';

/**
 * Forma mínima de un issue de Standard Schema que esta fábrica necesita (solo `path`). Se declara
 * localmente en vez de importar el tipo de `@standard-schema/spec` (dependencia transitiva de
 * `zod`, no declarada en `package.json`) para no depender de un paquete que este proyecto no
 * instala directamente; por ser una forma más amplia que `StandardSchemaV1.Issue` real (que
 * también exige `message`), sigue siendo compatible con la firma `exceptionFactory` del pipe
 * nativo (contravarianza de parámetros de función).
 */
export interface IssuePathMinimo {
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>;
}

/**
 * `exceptionFactory` del `StandardSchemaValidationPipe` nativo de NestJS 12 (D5, checkpoint (b)
 * de `tasks.md`): construye un {@link ErrorDeAplicacion} directamente desde los issues de
 * Standard Schema, en vez de dejar que el pipe arme su `BadRequestException` por defecto (que
 * aplana cada issue a una cadena `"campo: mensaje"` y pierde la estructura). Se sigue usando el
 * pipe nativo sin fork: `exceptionFactory` es su propio punto de extensión documentado
 * (`node_modules/@nestjs/common/pipes/standard-schema-validation.pipe.d.ts`).
 *
 * Checkpoint (b) resuelto leyendo el código real de zod v4
 * (`node_modules/zod/v4/core/util.js#finalizeIssue`): los issues que entrega
 * `schema['~standard'].validate(value)` sí traen `code` (`invalid_type`, `too_small`, etc.), pero
 * **nunca** el valor recibido (`input`) — zod solo lo adjunta cuando el contexto de validación
 * pide `reportInput`, algo que el `validate(value)` de Standard Schema nunca solicita (su firma
 * no acepta ese segundo argumento). Sin embargo, `code` por sí solo no permite distinguir `falta`
 * (la clave no vino) de `formato` (vino con el tipo equivocado) sin ese valor: por eso, tal como
 * anticipó el checkpoint, se emite `problema: 'formato'` para todos los campos, de forma uniforme
 * (no se clasifica parcialmente por código, porque eso daría una falsa impresión de precisión que
 * no existe para `invalid_type`). La regla que no se relaja — nunca repetir el valor recibido —
 * queda garantizada porque `input` nunca llega hasta acá.
 */
export function fabricaErrorValidacion(
  issues: readonly IssuePathMinimo[],
): ErrorDeAplicacion {
  const errores: DetalleCampo[] = issues.map((issue) => ({
    campo: nombreDeCampo(issue.path),
    problema: 'formato',
  }));

  return new ErrorDeAplicacion('validacion-fallida', { errores });
}

function nombreDeCampo(ruta: IssuePathMinimo['path']): string {
  if (ruta === undefined || ruta.length === 0) return '(raíz)';
  return ruta
    .map((segmento) => (typeof segmento === 'object' ? segmento.key : segmento))
    .map(String)
    .join('.');
}
