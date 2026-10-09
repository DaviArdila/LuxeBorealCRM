import { Inject, Injectable } from '@nestjs/common';
import type { SolicitudTurno } from '../../../conversaciones/index.js';
import { detectarPidePersona, RegistrarPidePersona } from '../../../leads/index.js';
import type { DecisionPolitica, EstadoTurno, PoliticaTurno } from '../../dominio/politica-turno.js';
import {
  REPOSITORIO_CONTACTO_AGENTE,
  type RepositorioContactoAgente,
} from '../../puertos/repositorio-contacto-agente.js';

/**
 * Petición explícita de persona (D6 de la Fase 08, R9, LDS3, AGT14; D6 de la Fase 12d): tercera política del
 * pipeline, antes del LLM. Si algún texto de la ráfaga pide hablar con una persona, registra el lead y pide avisar
 * al asesor con el motivo `pide-persona` (dentro o fuera de horario), pero deja seguir el turno: el modelo responde
 * en el mismo turno y la conversación sigue en `bot`. Ni responde con un texto propio ni traspasa. El lead solo se registra si el
 * contacto aceptó el tratamiento de datos (LDS3, AGT26); sin aceptación —o si la consulta falla— el aviso sale igual.
 */
@Injectable()
export class PoliticaPidePersona implements PoliticaTurno {
  constructor(
    private readonly registrarPidePersona: RegistrarPidePersona,
    @Inject(REPOSITORIO_CONTACTO_AGENTE) private readonly contactos: RepositorioContactoAgente,
  ) {}

  async evaluar(solicitud: SolicitudTurno, turno: EstadoTurno): Promise<DecisionPolitica> {
    const texto = solicitud.mensajes
      .filter((mensaje) => mensaje.tipoContenido === 'texto')
      .map((mensaje) => mensaje.texto)
      .join(' ');
    if (!detectarPidePersona(texto)) {
      return { decision: 'seguir' };
    }

    const { conversacionId, contactoId } = solicitud.contexto;
    if (await this.aceptoElTratamiento(contactoId)) {
      await this.registrarPidePersona.ejecutar({ conversacionId, contactoId });
    }
    turno.avisoPedido = 'pide-persona';
    return { decision: 'seguir' };
  }

  private async aceptoElTratamiento(contactoId: string): Promise<boolean> {
    try {
      return (await this.contactos.consentimientoDe(contactoId)) === 'aceptado';
    } catch {
      return false;
    }
  }
}
