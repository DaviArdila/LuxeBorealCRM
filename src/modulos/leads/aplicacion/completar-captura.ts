import { Inject, Injectable } from '@nestjs/common';
import { REPOSITORIO_LEAD, type RepositorioLead } from '../puertos/repositorio-lead.js';
import { esCapturaPendiente } from './obtener-captura-pendiente.js';

/**
 * Cierra la captura de datos fuera de horario (D5 de la Fase 08, R10, LDS4): con los datos del cliente ya
 * guardados, el lead queda `capturado_fuera_horario` y derivado. La conversación nunca salió de `bot`: no
 * hay transición. Si no hay captura pendiente no hace nada, así completarla dos veces no repite el aviso.
 */
@Injectable()
export class CompletarCaptura {
  constructor(@Inject(REPOSITORIO_LEAD) private readonly repositorio: RepositorioLead) {}

  async ejecutar(conversacionId: string): Promise<{ leadId: string } | null> {
    const lead = await this.repositorio.obtenerAbiertoDeConversacion(conversacionId);
    if (!esCapturaPendiente(lead)) {
      return null;
    }
    await this.repositorio.actualizar(lead.id, { derivado: true, capturadoFueraHorario: true });
    return { leadId: lead.id };
  }
}
