import { z } from 'zod';

/**
 * Forma de un indicador individual de Terminus (`HealthIndicatorResult`, PLT4): siempre trae
 * `status`, y puede traer campos adicionales por indicador (p. ej. `responseTime`) que este
 * esquema no restringe — documentar de más sería inventar un contrato que Terminus no promete.
 */
const esquemaIndicador = z
  .object({ status: z.enum(['up', 'down', 'degraded']) })
  .catchall(z.unknown());

const esquemaMapaIndicadores = z.record(z.string(), esquemaIndicador);

/**
 * Esquema zod de la respuesta de `GET /health` (D6, D4 de 00b): única fuente para documentar el
 * endpoint (`respuestaDesdeZod`) y para verificar la respuesta real en e2e
 * (`test/e2e/aplicacion.e2e-spec.ts`). `/health` sigue exento de `application/problem+json`
 * (API4, `FiltroSaludOperativo`); este esquema describe el cuerpo propio de Terminus, no un
 * `Problema`.
 */
export const esquemaRespuestaSalud = z.object({
  status: z.enum(['ok', 'error', 'degraded', 'shutting_down']),
  info: esquemaMapaIndicadores.optional(),
  error: esquemaMapaIndicadores.optional(),
  details: esquemaMapaIndicadores,
});

export type RespuestaSalud = z.infer<typeof esquemaRespuestaSalud>;
