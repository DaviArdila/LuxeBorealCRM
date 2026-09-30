import { z } from 'zod';
import type { Herramienta } from '../../dominio/herramienta.js';
import type { EvaluadorLead } from '../../puertos/evaluador-lead.js';
import { definirHerramienta } from './definir-herramienta.js';

const esquema = z.object({
  temperatura: z.enum(['tibio', 'caliente']).describe('Qué tan cerca está el cliente de comprar.'),
  senales: z.array(z.string()).describe('Señales concretas que dijo o hizo el cliente.'),
  resumen: z.string().min(1).describe('Resumen breve de lo que busca el cliente, sin datos personales.'),
  id_producto: z.string().nullable().describe('El id o SKU del producto de interés, o null si no hay uno.'),
});

/**
 * `marcar_lead_caliente` (AGT11): el modelo propone y el puerto `EVALUADOR_LEAD` decide (R9). Un turno
 * que ya dejó el efecto `sin-cobertura` responde `derivado: false` sin consultar la escala: un cliente
 * al que no se le puede vender no es un lead. La herramienta nunca escribe en `lead` ni deriva.
 */
export function crearMarcarLeadCaliente(evaluador: EvaluadorLead): Herramienta {
  return definirHerramienta(
    'marcar_lead_caliente',
    'Propone marcar al cliente como lead cuando muestra intención de compra (pide pagar, apartar, cerrar el pedido). La decisión final la toma el sistema; usa lo que devuelva.',
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
        paraElModelo: decision,
        efectos: [{ tipo: 'lead-propuesto', temperatura }],
      };
    },
  );
}
