import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../../plataforma/config/index.js';
import { ObtenerReferenciaConversacion } from '../../conversaciones/index.js';
import { construirEnlaceConversacion } from '../dominio/enlace-conversacion.js';

/**
 * Enlace que abre una conversación en Chatwoot, a partir del id interno (NTF5, D1 y D6 de la Fase 08d). Nunca
 * lanza: si la conversación no existe, no tiene identificador de Chatwoot o la consulta falla, el aviso sale sin
 * enlace y queda un `warn` sin datos del cliente (R14).
 */
@Injectable()
export class ResolverEnlaceConversacion {
  private readonly logger = new Logger(ResolverEnlaceConversacion.name);

  constructor(
    private readonly obtenerReferencia: ObtenerReferenciaConversacion,
    @Inject(CONFIGURACION)
    private readonly configuracion: Pick<Configuracion, 'CHATWOOT_URL' | 'CHATWOOT_URL_PUBLICA' | 'CHATWOOT_ACCOUNT_ID'>,
  ) {}

  async ejecutar(conversacionId: string | null): Promise<string | undefined> {
    if (conversacionId === null) {
      return undefined;
    }
    try {
      const referencia = await this.obtenerReferencia.ejecutar(conversacionId);
      const enlace = construirEnlaceConversacion({
        urlPublica: this.configuracion.CHATWOOT_URL_PUBLICA,
        urlChatwoot: this.configuracion.CHATWOOT_URL,
        cuenta: this.configuracion.CHATWOOT_ACCOUNT_ID,
        idChatwoot: referencia?.chatwootConversationId,
      });
      if (enlace === null) {
        this.logger.warn({ evento: 'notificaciones.enlace-sin-identificador' });
        return undefined;
      }
      return enlace;
    } catch (error) {
      this.logger.warn({
        evento: 'notificaciones.enlace-fallo',
        error: error instanceof Error ? error.name : 'desconocido',
      });
      return undefined;
    }
  }
}
