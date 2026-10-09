import { z } from 'zod';
import type { ConsultaCasos } from '../../../asistente/index.js';
import type { Herramienta } from '../../dominio/herramienta.js';
import { casoParaElModelo } from './contrato-modelo.js';
import { definirHerramienta } from './definir-herramienta.js';

const esquema = z.object({
  titulo: z.string().min(1).describe('Título de un caso del índice, tal como aparece en la lista de casos de uso del prompt.'),
});

/**
 * `consultar_caso` (AGT8, CAS8): envuelve `ConsultaCasos` y devuelve el texto y el modo del caso, sin interpretarlo (R1, R2).
 * Un título que no existe lista los disponibles: el modelo no debe inventar un caso que el
 * negocio no definió.
 */
export function crearConsultarCaso(casos: ConsultaCasos): Herramienta {
  return definirHerramienta(
    'consultar_caso',
    'Devuelve el texto y el modo (literal o guía) de un caso de uso del índice. Si el título no existe, lista los disponibles.',
    esquema,
    async ({ titulo }) => ({ paraElModelo: casoParaElModelo(await casos.consultar(titulo)), efectos: [] }),
  );
}
