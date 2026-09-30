import { Injectable } from '@nestjs/common';
import type { EvaluadorLead } from '../puertos/evaluador-lead.js';

/**
 * Evaluador de leads de la Fase 07 (D6, AGT11): sin la escala determinista (R9-R11, Fase 08) no hay
 * base para confirmar que un cliente está listo para un asesor, así que nunca deriva, no escribe en
 * `lead` y le dice al modelo que siga atendiendo. La 08 reemplaza este binding sin tocar la herramienta.
 */
@Injectable()
export class EvaluadorLeadSinEscala implements EvaluadorLead {
  evaluar(): Promise<{ derivado: boolean; motivo?: string }> {
    return Promise.resolve({
      derivado: false,
      motivo: 'Las señales aún no confirman intención de compra; sigue atendiendo al cliente.',
    });
  }
}
