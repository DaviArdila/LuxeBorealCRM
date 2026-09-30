import { Injectable } from '@nestjs/common';
import { CompletarCaptura, ObtenerCapturaPendiente } from '../../../leads/index.js';
import type { CapturaLead } from '../../puertos/captura-lead.js';

/** Adaptador del puerto `CAPTURA_LEAD` sobre el módulo `leads` (D5 de la Fase 08, ADR-0016). */
@Injectable()
export class CapturaLeadDeLeads implements CapturaLead {
  constructor(
    private readonly pendienteDeLeads: ObtenerCapturaPendiente,
    private readonly completarDeLeads: CompletarCaptura,
  ) {}

  pendiente(conversacionId: string): Promise<boolean> {
    return this.pendienteDeLeads.ejecutar(conversacionId);
  }

  async completar(conversacionId: string): Promise<void> {
    await this.completarDeLeads.ejecutar(conversacionId);
  }
}
