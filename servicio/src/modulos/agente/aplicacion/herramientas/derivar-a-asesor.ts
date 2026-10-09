import { z } from 'zod';
import type { Herramienta } from '../../dominio/herramienta.js';
import { definirHerramienta } from './definir-herramienta.js';

const esquema = z.strictObject({
  motivo: z.string().min(1).max(200).describe('Texto breve que justifica el aviso.'),
});

/**
 * `derivar_a_asesor` (AGT24): deja el efecto `avisar-asesor` con el motivo `pide-asesor` y el bot sigue en el mismo
 * turno; no cambia el estado de la conversación. El `motivo` que escribe el modelo solo justifica la llamada: no se
 * guarda, no se registra y no viaja al aviso (R14), así que ni se lee. Dentro y fuera de horario hace lo mismo.
 */
export function crearDerivarAAsesor(): Herramienta {
  return definirHerramienta(
    'derivar_a_asesor',
    'Avisa a un asesor humano sin traspasar la conversación. Devuelve { derivado: true }.',
    esquema,
    () => Promise.resolve({ paraElModelo: { derivado: true }, efectos: [{ tipo: 'avisar-asesor', motivo: 'pide-asesor' }] }),
  );
}
