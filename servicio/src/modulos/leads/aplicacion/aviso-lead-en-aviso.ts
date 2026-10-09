import { Injectable } from '@nestjs/common';
import type { EventoAviso, ObservadorAviso } from '../../conversaciones/index.js';
import { AvisarLead } from './avisar-lead.js';

/**
 * Observador de aviso de `leads` (D4 de la Fase 12d, R11, NTF3): un lead caliente confirmado dentro de horario avisa al
 * asesor sin traspasar la conversación. `conversaciones` lo notifica **después** de encolados los pasos de la respuesta y
 * con la marca del motivo ya adquirida; aquí se encola el aviso del lead con su ventana de 24 h por contacto. Los demás
 * motivos (`pide-persona`, `pide-asesor`, `audio-repetido`) los avisa `notificaciones`. Si el encolado falla el error
 * sube, el registro de observadores lo anota y `conversaciones` libera la marca para que el turno siguiente reintente.
 */
@Injectable()
export class AvisoLeadEnAviso implements ObservadorAviso {
  constructor(private readonly avisarLead: AvisarLead) {}

  async alAvisarAsesor(evento: EventoAviso): Promise<void> {
    if (evento.motivo !== 'lead-caliente') {
      return;
    }
    await this.avisarLead.ejecutar(evento.conversacionId);
  }
}
