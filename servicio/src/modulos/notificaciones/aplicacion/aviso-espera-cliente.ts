import { Injectable } from '@nestjs/common';
import type { EventoEsperaCliente, ObservadorEsperaCliente } from '../../conversaciones/index.js';
import { EncolarAviso } from './encolar-aviso.js';
import { ResolverEnlaceConversacion } from './resolver-enlace-conversacion.js';

/**
 * Observador de espera de `notificaciones` (D5 de la Fase 08d, NTF7): cuando un cliente lleva `ESPERA_CLIENTE_MIN`
 * minutos escribiendo bajo control humano sin respuesta, encola un aviso con hace cuánto esperó y el enlace a la
 * conversación. La clave de idempotencia es `espera:<conversación>:<instante del primer mensaje>`: cada espera tiene
 * su aviso y el outbox no lo duplica. No consulta la ventana por contacto de los leads (NTF2). Si el encolado falla,
 * el error sube y el barrido devuelve la espera para reintentar.
 */
@Injectable()
export class AvisoEsperaCliente implements ObservadorEsperaCliente {
  constructor(
    private readonly encolarAviso: EncolarAviso,
    private readonly resolverEnlace: ResolverEnlaceConversacion,
  ) {}

  async alEsperarCliente(evento: EventoEsperaCliente): Promise<void> {
    const enlace = await this.resolverEnlace.ejecutar(evento.conversacionId);
    await this.encolarAviso.ejecutar({
      claveIdempotencia: `espera:${evento.conversacionId}:${String(evento.desde.getTime())}`,
      grupo: `conversacion:${evento.conversacionId}`,
      aviso: { tipo: 'espera', esperaMin: evento.esperaMin, ...(enlace === undefined ? {} : { enlace }) },
    });
  }
}
