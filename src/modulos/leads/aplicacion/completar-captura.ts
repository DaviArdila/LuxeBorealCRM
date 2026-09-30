import { Inject, Injectable, Logger } from '@nestjs/common';
import { REPOSITORIO_LEAD, type RepositorioLead } from '../puertos/repositorio-lead.js';
import { AvisarLead } from './avisar-lead.js';
import { esCapturaPendiente } from './obtener-captura-pendiente.js';

/**
 * Cierra la captura de datos fuera de horario (D5 de la Fase 08, R10, LDS4): con los datos del cliente ya
 * guardados, el lead queda `capturado_fuera_horario` y derivado, y se avisa a los asesores (NTF2). La
 * conversación nunca salió de `bot`: no hay transición. Si no hay captura pendiente no hace nada, así
 * completarla dos veces no repite el aviso. Un aviso que falla no deshace la captura: los datos ya están a
 * salvo y el fallo se registra (solo el nombre del error, R14).
 */
@Injectable()
export class CompletarCaptura {
  private readonly logger = new Logger(CompletarCaptura.name);

  constructor(
    @Inject(REPOSITORIO_LEAD) private readonly repositorio: RepositorioLead,
    private readonly avisarLead: AvisarLead,
  ) {}

  async ejecutar(conversacionId: string): Promise<{ leadId: string } | null> {
    const lead = await this.repositorio.obtenerAbiertoDeConversacion(conversacionId);
    if (!esCapturaPendiente(lead)) {
      return null;
    }
    await this.repositorio.actualizar(lead.id, { derivado: true, capturadoFueraHorario: true });
    try {
      await this.avisarLead.ejecutar(conversacionId);
    } catch (error) {
      this.logger.warn({
        evento: 'leads.aviso-captura-fallo',
        error: error instanceof Error ? error.name : 'desconocido',
      });
    }
    return { leadId: lead.id };
  }
}
