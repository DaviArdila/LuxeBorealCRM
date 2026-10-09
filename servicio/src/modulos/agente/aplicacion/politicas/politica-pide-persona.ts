import { Injectable } from '@nestjs/common';
import type { SolicitudTurno } from '../../../conversaciones/index.js';
import { detectarPidePersona, RegistrarPidePersona } from '../../../leads/index.js';
import type { DecisionPolitica, EstadoTurno, PoliticaTurno } from '../../dominio/politica-turno.js';

/**
 * Petición explícita de persona (D6 de la Fase 08, R9, LDS3, AGT14; D6 de la Fase 12d): tercera política del
 * pipeline, antes del LLM. Si algún texto de la ráfaga pide hablar con una persona, registra el lead y pide avisar
 * al asesor con el motivo `pide-persona` (dentro o fuera de horario), pero deja seguir el turno: el modelo responde
 * en el mismo turno y la conversación sigue en `bot`. Ni responde con un texto propio ni traspasa.
 */
@Injectable()
export class PoliticaPidePersona implements PoliticaTurno {
  constructor(private readonly registrarPidePersona: RegistrarPidePersona) {}

  async evaluar(solicitud: SolicitudTurno, turno: EstadoTurno): Promise<DecisionPolitica> {
    const texto = solicitud.mensajes
      .filter((mensaje) => mensaje.tipoContenido === 'texto')
      .map((mensaje) => mensaje.texto)
      .join(' ');
    if (!detectarPidePersona(texto)) {
      return { decision: 'seguir' };
    }

    const { conversacionId, contactoId } = solicitud.contexto;
    await this.registrarPidePersona.ejecutar({ conversacionId, contactoId });
    turno.avisoPedido = 'pide-persona';
    return { decision: 'seguir' };
  }
}
