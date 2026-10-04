import { Injectable } from '@nestjs/common';
import type { EventoHandoff, MotivoHandoff, ObservadorHandoff } from '../../conversaciones/index.js';
import type { MotivoTraspaso } from '../dominio/armar-aviso.js';
import { EncolarAviso } from './encolar-aviso.js';
import { ResolverEnlaceConversacion } from './resolver-enlace-conversacion.js';

/**
 * Qué motivo de handoff avisa como «traspaso sin lead» (NTF6). Los dos que nacen de un lead (`lead-caliente`,
 * `pide-persona`) son `null`: los avisa `leads` con su propia ventana por contacto (NTF2). Es un `Record`
 * exhaustivo a propósito: un motivo de handoff nuevo no compila hasta que se decide si avisa.
 */
const TRASPASO_DE_MOTIVO: Readonly<Record<MotivoHandoff, MotivoTraspaso | null>> = {
  'tope-turnos': 'tope-turnos',
  'fallo-llm': 'fallo-llm',
  'techo-gasto': 'techo-gasto',
  'audio-repetido': 'audio-repetido',
  'argumentos-invalidos': 'argumentos-invalidos',
  'plazo-agotado': 'plazo-agotado',
  'lead-caliente': null,
  'pide-persona': null,
};

/**
 * Observador de handoff de `notificaciones` (D3 de la Fase 08d, NTF6): cuando una conversación pasa a una
 * persona por un motivo que no es de lead —tope de turnos, falla del LLM, techo de gasto, audios, argumentos
 * inválidos, plazo agotado—, encola un aviso con el motivo y el enlace a la conversación. `conversaciones` lo
 * notifica solo después de confirmar la transición (NTF3). No crea un lead ni consulta ninguna ventana por
 * contacto: se limita a uno por instancia, con la clave `traspaso:<conversación>:<versión>:<motivo>`, que el
 * outbox no duplica; un traspaso posterior (otra versión de la conversación) avisa de nuevo. Si el encolado
 * falla, el error sube y el registro de observadores lo anota sin revertir el handoff.
 */
@Injectable()
export class AvisoTraspaso implements ObservadorHandoff {
  constructor(
    private readonly encolarAviso: EncolarAviso,
    private readonly resolverEnlace: ResolverEnlaceConversacion,
  ) {}

  async alConfirmarHandoff(evento: EventoHandoff): Promise<void> {
    const motivo = TRASPASO_DE_MOTIVO[evento.motivo];
    if (motivo === null) {
      return;
    }
    const enlace = await this.resolverEnlace.ejecutar(evento.conversacionId);
    await this.encolarAviso.ejecutar({
      claveIdempotencia: `traspaso:${evento.conversacionId}:${String(evento.version)}:${motivo}`,
      grupo: `conversacion:${evento.conversacionId}`,
      aviso: { tipo: 'traspaso', motivo, ...(enlace === undefined ? {} : { enlace }) },
    });
  }
}
