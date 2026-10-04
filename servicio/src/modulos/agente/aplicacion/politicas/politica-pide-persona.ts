import { Injectable } from '@nestjs/common';
import type { SolicitudTurno } from '../../../conversaciones/index.js';
import { detectarPidePersona, RegistrarPidePersona } from '../../../leads/index.js';
import type { DecisionPolitica, PoliticaTurno } from '../../dominio/politica-turno.js';
import { TextoHandoff } from '../texto-handoff.js';

/**
 * Petición explícita de persona (D6 de la Fase 08, R9, LDS3, AGT14): tercera política del pipeline, antes
 * del LLM. Si algún texto de la ráfaga pide hablar con una persona, registra el lead y, con asesores
 * disponibles, responde con el texto de handoff y el motivo `pide-persona` sin llamar al modelo. Fuera de
 * horario solo registra el lead pendiente de captura y deja seguir el turno (LDS4): el bot no aparca al
 * cliente. La respuesta de derivación no consume turno; tras ella la conversación deja de ser `bot`.
 */
@Injectable()
export class PoliticaPidePersona implements PoliticaTurno {
  constructor(
    private readonly registrarPidePersona: RegistrarPidePersona,
    private readonly textoHandoff: TextoHandoff,
  ) {}

  async evaluar(solicitud: SolicitudTurno): Promise<DecisionPolitica> {
    const texto = solicitud.mensajes
      .filter((mensaje) => mensaje.tipoContenido === 'texto')
      .map((mensaje) => mensaje.texto)
      .join(' ');
    if (!detectarPidePersona(texto)) {
      return { decision: 'seguir' };
    }

    const { conversacionId, contactoId } = solicitud.contexto;
    const resultado = await this.registrarPidePersona.ejecutar({ conversacionId, contactoId });
    if (resultado.accion !== 'derivar') {
      return { decision: 'seguir' };
    }
    return {
      decision: 'responder',
      respuesta: {
        pasos: [{ paso: 'handoff-1', tipo: 'texto', texto: await this.textoHandoff.obtener() }],
        handoff: { motivo: 'pide-persona' },
      },
      cuentaTurno: false,
    };
  }
}
