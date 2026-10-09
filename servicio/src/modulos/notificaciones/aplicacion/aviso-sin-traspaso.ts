import { Injectable } from '@nestjs/common';
import type { EventoAviso, MotivoAviso, ObservadorAviso } from '../../conversaciones/index.js';
import type { MotivoAvisoSinTraspaso } from '../dominio/armar-aviso.js';
import { EncolarAviso } from './encolar-aviso.js';
import { ResolverEnlaceConversacion } from './resolver-enlace-conversacion.js';

/**
 * Qué motivo de aviso encola `notificaciones` y bajo qué motivo de idempotencia (NTF8). `pide-persona` y `pide-asesor`
 * son el mismo motivo para la clave (el cliente pide una persona, CNV14) pero cada uno conserva su propio texto.
 * `lead-caliente` es `null`: lo avisa `leads` con su ventana por contacto (R11, NTF2). Es un `Record` exhaustivo a
 * propósito: un motivo de aviso nuevo no compila hasta que se decide quién lo avisa.
 */
const AVISO_DE_MOTIVO: Readonly<
  Record<MotivoAviso, { readonly texto: MotivoAvisoSinTraspaso; readonly clave: string } | null>
> = {
  'pide-persona': { texto: 'pide-persona', clave: 'pide-persona' },
  'pide-asesor': { texto: 'pide-asesor', clave: 'pide-persona' },
  'audio-repetido': { texto: 'audio-repetido', clave: 'audio-repetido' },
  'lead-caliente': null,
};

/**
 * Observador de aviso de `notificaciones` (D4 de la Fase 12d, NTF8): cuando un turno pide avisar al asesor sin
 * traspasar —el cliente pide una persona, el modelo deriva o el cliente insiste con audios—, encola un aviso con el
 * motivo y el enlace a la conversación, dentro y fuera de horario. No crea un lead ni consulta la ventana por
 * contacto. La clave `aviso:<conversación>:<versión>:<motivo>` hace que el outbox no duplique el mismo aviso aunque
 * falle la marca de Redis; otra versión de la conversación (pasó por un asesor) avisa de nuevo. Si el encolado falla,
 * el error sube y `conversaciones` libera la marca del motivo para que el turno siguiente reintente.
 */
@Injectable()
export class AvisoSinTraspaso implements ObservadorAviso {
  constructor(
    private readonly encolarAviso: EncolarAviso,
    private readonly resolverEnlace: ResolverEnlaceConversacion,
  ) {}

  async alAvisarAsesor(evento: EventoAviso): Promise<void> {
    const aviso = AVISO_DE_MOTIVO[evento.motivo];
    if (aviso === null) {
      return;
    }
    const enlace = await this.resolverEnlace.ejecutar(evento.conversacionId);
    await this.encolarAviso.ejecutar({
      claveIdempotencia: `aviso:${evento.conversacionId}:${String(evento.version)}:${aviso.clave}`,
      grupo: `conversacion:${evento.conversacionId}`,
      aviso: { tipo: 'aviso', motivo: aviso.texto, ...(enlace === undefined ? {} : { enlace }) },
    });
  }
}
