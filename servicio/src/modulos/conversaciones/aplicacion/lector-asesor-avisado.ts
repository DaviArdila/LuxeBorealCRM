import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MARCA_ASESOR_AVISADO,
  type ConsultaAsesorAvisado,
  type MarcaAsesorAvisado,
} from '../puertos/marca-asesor-avisado.js';

/** Lectura de la marca «asesor avisado» para el agente (CNV15): ante un fallo del almacén responde «no avisado». */
@Injectable()
export class LectorAsesorAvisado implements ConsultaAsesorAvisado {
  private readonly logger = new Logger(LectorAsesorAvisado.name);

  constructor(@Inject(MARCA_ASESOR_AVISADO) private readonly marca: Pick<MarcaAsesorAvisado, 'estaAvisado'>) {}

  async estaAvisado(conversacionId: string): Promise<boolean> {
    try {
      return await this.marca.estaAvisado(conversacionId);
    } catch (error) {
      this.logger.warn({
        evento: 'conversaciones.asesor-avisado-lectura-fallo',
        error: error instanceof Error ? error.name : 'desconocido',
      });
      return false;
    }
  }
}
