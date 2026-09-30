import { z } from 'zod';
import type { ContextoHerramienta, Herramienta, ResultadoHerramientaAgente } from '../../dominio/herramienta.js';

/**
 * Arma una {@link Herramienta} a partir de su esquema Zod: la definición que ve el modelo (nombre,
 * descripción y JSON Schema salen del mismo esquema, así no pueden divergir) y una ejecución que
 * vuelve a validar los argumentos antes de tocar el caso de uso (defensa en profundidad: el gateway ya
 * los validó, D13 de la Fase 06). Un argumento que no valida lanza y el bucle lo devuelve como error.
 */
export function definirHerramienta<Esquema extends z.ZodType>(
  nombre: string,
  descripcion: string,
  esquema: Esquema,
  ejecutar: (argumentos: z.output<Esquema>, ctx: ContextoHerramienta) => Promise<ResultadoHerramientaAgente>,
): Herramienta {
  return {
    definicion: { nombre, descripcion, esquema, esquemaJson: z.toJSONSchema(esquema) },
    ejecutar: (argumentos, ctx) => ejecutar(esquema.parse(argumentos), ctx),
  };
}
