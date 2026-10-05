import { Injectable, Logger } from '@nestjs/common';
import { ObtenerNombreProducto } from '../../catalogo/index.js';
import { ResolverEnlaceConversacion, type DatosAvisoLead } from '../../notificaciones/index.js';
import type { Lead } from '../dominio/lead.js';

/**
 * Arma lo que el aviso al asesor sabe de un lead (NTF1, NTF5 de la Fase 08d): la temperatura, las señales y el
 * resumen que ya guarda el lead, más el producto de interés por su nombre (nunca el SKU, AGT16) y el enlace a la
 * conversación en Chatwoot. Es lo que comparten el aviso inicial y el recordatorio. Un producto o un enlace que
 * no se pueden resolver se omiten: el aviso sale igual, porque perder el aviso es peor que perder un dato.
 */
@Injectable()
export class ArmarDatosAvisoLead {
  private readonly logger = new Logger(ArmarDatosAvisoLead.name);

  constructor(
    private readonly resolverEnlace: ResolverEnlaceConversacion,
    private readonly obtenerNombreProducto: ObtenerNombreProducto,
  ) {}

  async ejecutar(lead: Lead, tipo: DatosAvisoLead['tipo']): Promise<DatosAvisoLead> {
    const [enlace, producto] = await Promise.all([
      this.resolverEnlace.ejecutar(lead.conversacionId),
      this.nombreDelProducto(lead.productoId),
    ]);
    return {
      tipo,
      temperatura: lead.temperatura,
      senales: lead.senales,
      resumen: lead.resumen,
      capturadoFueraHorario: lead.capturadoFueraHorario,
      ...(producto === null ? {} : { producto }),
      ...(enlace === undefined ? {} : { enlace }),
    };
  }

  private async nombreDelProducto(productoId: string | null): Promise<string | null> {
    if (productoId === null) {
      return null;
    }
    try {
      return await this.obtenerNombreProducto.ejecutar(productoId);
    } catch (error) {
      this.logger.warn({
        evento: 'leads.aviso-producto-fallo',
        error: error instanceof Error ? error.name : 'desconocido',
      });
      return null;
    }
  }
}
