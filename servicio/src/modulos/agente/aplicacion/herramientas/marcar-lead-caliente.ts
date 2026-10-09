import { z } from 'zod';
import { NOMBRES_SENALES } from '../../../leads/index.js';
import type { Herramienta } from '../../dominio/herramienta.js';
import type { EvaluadorLead } from '../../puertos/evaluador-lead.js';
import { definirHerramienta } from './definir-herramienta.js';

const esquema = z.object({
  temperatura: z.enum(['tibio', 'caliente']).describe('Qué tan cerca está el cliente de comprar.'),
  senales: z
    .array(z.enum(NOMBRES_SENALES))
    .describe('Señales concretas que dijo o hizo el cliente, solo del vocabulario permitido.'),
  resumen: z.string().min(1).describe('Resumen breve de lo que busca el cliente, sin datos personales.'),
  id_producto: z.string().nullable().describe('El id del producto de interés, o null si no hay uno.'),
});

/**
 * `marcar_lead_caliente` (AGT11): el modelo propone —con señales de un vocabulario cerrado, LDS1— y el
 * puerto `EVALUADOR_LEAD` decide (R9). Un turno que ya dejó el efecto `sin-cobertura` responde
 * `derivado: false` sin consultar la escala: un cliente al que no se le puede vender no es un lead. La
 * herramienta no escribe ni deriva por sí misma: si la escala confirmó y hay que derivar deja el efecto
 * `lead-derivado`, que `ContenidoLlm` convierte en handoff (D4 de la Fase 08).
 */
export function crearMarcarLeadCaliente(evaluador: EvaluadorLead): Herramienta {
  return definirHerramienta(
    'marcar_lead_caliente',
    'Propone marcar al cliente como lead, con su temperatura y señales de un vocabulario cerrado. La decisión final la toma el sistema y se devuelve.',
    esquema,
    async ({ temperatura, senales, resumen, id_producto }, ctx) => {
      if (ctx.efectosPrevios.some((efecto) => efecto.tipo === 'sin-cobertura')) {
        return {
          paraElModelo: { derivado: false, motivo: 'El destino no tiene cobertura; no aplica derivar a un asesor.' },
          efectos: [],
        };
      }
      const decision = await evaluador.evaluar({ temperatura, senales, resumen, productoId: id_producto }, ctx);
      return {
        paraElModelo: { derivado: decision.derivado, ...(decision.motivo === undefined ? {} : { motivo: decision.motivo }) },
        efectos:
          decision.accion === 'derivar' && decision.leadId !== null
            ? [{ tipo: 'lead-derivado', leadId: decision.leadId }]
            : [{ tipo: 'lead-propuesto', temperatura }],
      };
    },
  );
}
