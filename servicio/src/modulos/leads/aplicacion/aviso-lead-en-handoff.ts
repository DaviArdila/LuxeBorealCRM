import { Injectable } from '@nestjs/common';
import type { EventoHandoff, ObservadorHandoff } from '../../conversaciones/index.js';
import { AvisarLead } from './avisar-lead.js';

/** Motivos de handoff que nacen de un lead: los demás (tope, fallo del LLM…) no llevan aviso comercial. */
const MOTIVOS_DE_LEAD: ReadonlySet<EventoHandoff['motivo']> = new Set(['lead-caliente', 'pide-persona']);

/**
 * Observador de handoff de `leads` (D7 de la Fase 08, NTF3): `conversaciones` lo notifica solo después de
 * confirmar la transición, y recién entonces se encola el aviso. Si el aviso falla, el registro de
 * observadores lo registra sin revertir el handoff.
 */
@Injectable()
export class AvisoLeadEnHandoff implements ObservadorHandoff {
  constructor(private readonly avisarLead: AvisarLead) {}

  async alConfirmarHandoff(evento: EventoHandoff): Promise<void> {
    if (!MOTIVOS_DE_LEAD.has(evento.motivo)) {
      return;
    }
    await this.avisarLead.ejecutar(evento.conversacionId);
  }
}
