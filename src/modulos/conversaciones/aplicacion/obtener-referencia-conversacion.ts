import { Inject, Injectable } from '@nestjs/common';
import { REPOSITORIO_CONVERSACION, type RepositorioConversacion } from '../puertos/repositorio-conversacion.js';

/** Lo único que un módulo de arriba necesita saber de una conversación para enlazarla (D6 de la Fase 08d). */
export interface ReferenciaConversacion {
  readonly chatwootConversationId: number;
}

/**
 * Lectura mínima de una conversación por su id interno (D6 de la Fase 08d, NTF5): devuelve solo el identificador
 * que tiene en Chatwoot, para que `notificaciones` arme el enlace sin conocer el estado ni el contacto. Sin ese
 * dato no se puede enlazar, y `null` es una respuesta normal, no un error.
 */
@Injectable()
export class ObtenerReferenciaConversacion {
  constructor(@Inject(REPOSITORIO_CONVERSACION) private readonly repositorio: RepositorioConversacion) {}

  async ejecutar(conversacionId: string): Promise<ReferenciaConversacion | null> {
    const conversacion = await this.repositorio.obtenerPorId(conversacionId);
    if (conversacion === null) {
      return null;
    }
    return { chatwootConversationId: conversacion.chatwootConversationId };
  }
}
