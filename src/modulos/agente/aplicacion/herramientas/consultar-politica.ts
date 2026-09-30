import { z } from 'zod';
import type { ConsultarPolitica } from '../../../catalogo/index.js';
import type { Herramienta } from '../../dominio/herramienta.js';
import { politicaParaElModelo } from './contrato-modelo.js';
import { definirHerramienta } from './definir-herramienta.js';

const esquema = z.object({
  tema: z.string().min(1).describe('Tema de la política, p. ej. "devoluciones" o "contra_entrega".'),
});

/**
 * `consultar_politica` (AGT8): envuelve `ConsultarPolitica` y devuelve el texto tal cual está
 * guardado, sin interpretarlo (R1, R2). Un tema inexistente lista los disponibles: el modelo no debe
 * inventar una política que el negocio no definió.
 */
export function crearConsultarPolitica(politicas: ConsultarPolitica): Herramienta {
  return definirHerramienta(
    'consultar_politica',
    'Devuelve el texto literal de una política del negocio (devoluciones, contra entrega, etc.). Si el tema no existe, lista los temas disponibles.',
    esquema,
    async ({ tema }) => ({ paraElModelo: politicaParaElModelo(await politicas.ejecutar(tema)), efectos: [] }),
  );
}
