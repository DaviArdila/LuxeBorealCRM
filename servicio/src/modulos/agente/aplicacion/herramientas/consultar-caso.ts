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
 * Reemplaza a `consultar_politica`. Un título que no existe lista los disponibles: el modelo no debe inventar un caso que el
 * negocio no definió.
 */
export function crearConsultarCaso(casos: ConsultaCasos): Herramienta {
  return definirHerramienta(
    'consultar_caso',
    'Devuelve el texto de un caso de uso del negocio (devoluciones, contra entrega, medios de pago, etc.) y su modo: literal se cita palabra por palabra; guía es base para redactar. Solo para casos del índice. Si el título no existe, lista los disponibles.',
    esquema,
    async ({ titulo }) => ({ paraElModelo: casoParaElModelo(await casos.consultar(titulo)), efectos: [] }),
  );
}
