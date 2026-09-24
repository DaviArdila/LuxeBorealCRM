import { z } from 'zod';

/**
 * Esquemas del controlador *fixture* de `test/contrato/` (D3 de `design.md`): ejercitan el pipe
 * de validación global y las convenciones de API3 sin inventar negocio. Nunca se importan desde
 * `src/` — la frontera `src-no-importa-test` (T1 de 00a) lo vuelve estructuralmente imposible.
 */
export const esquemaCrearEjemplo = z.object({
  nombre: z.string().min(1),
  precioCop: z.number().int().nonnegative(),
});

export type CrearEjemplo = z.infer<typeof esquemaCrearEjemplo>;

/** Forma de respuesta del fixture (API3): id UUID, dinero entero, fecha ISO 8601 UTC. */
export interface Ejemplo {
  readonly id: string;
  readonly nombre: string;
  readonly precioCop: number;
  readonly creadoEn: string;
}
