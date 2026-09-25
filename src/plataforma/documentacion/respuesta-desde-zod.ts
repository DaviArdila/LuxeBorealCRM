import { ApiResponse } from '@nestjs/swagger';
import type { z } from 'zod';

export interface OpcionesRespuestaDesdeZod {
  /** Código HTTP documentado; por defecto `200` (skill §10: la mayoría de respuestas son 200). */
  readonly status?: number;
  readonly description: string;
}

/**
 * Decorador que documenta la respuesta de un endpoint desde el mismo esquema zod que la valida
 * (skill §10): nunca se escribe un esquema OpenAPI a mano con `@ApiProperty`.
 *
 * Checkpoint (c) de `tasks.md` resuelto (inspección de `node_modules/@nestjs/swagger` 12.0.2 y de
 * `node_modules/zod` 4.6.5, 2026-09-25): `@nestjs/swagger@12` acepta el Standard Schema
 * **directamente** en `@ApiResponse({ standardSchema })`
 * (`services/response-object-factory.js`, `getSchemaOverride` tiene prioridad sobre `schema`/`type`
 * y gana siempre que `standardSchema` resuelve). No hace falta `z.toJSONSchema(esquema)`: zod v4
 * expone `~standard.jsonSchema` de fábrica (`zod/v4/classic/schemas.js`), que es exactamente lo que
 * `StandardSchemaOpenApiConverter` invoca (`target: 'openapi-3.0'`). Por eso este decorador pasa el
 * esquema zod tal cual, sin conversión intermedia.
 */
export function respuestaDesdeZod(
  esquema: z.ZodType,
  opciones: OpcionesRespuestaDesdeZod,
): MethodDecorator & ClassDecorator {
  return ApiResponse({
    status: opciones.status ?? 200,
    description: opciones.description,
    standardSchema: esquema,
  });
}
