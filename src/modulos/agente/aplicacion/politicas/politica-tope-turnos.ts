import { Inject, Injectable } from '@nestjs/common';
import type { SolicitudTurno } from '../../../conversaciones/index.js';
import { CONFIGURACION, type Configuracion } from '../../../../plataforma/config/index.js';
import type { DecisionPolitica, PoliticaTurno } from '../../dominio/politica-turno.js';
import { CONTADORES_SESION, type ContadoresSesion } from '../../puertos/contadores-sesion.js';
import { TextoHandoff } from '../texto-handoff.js';

/**
 * R13 (D6 de la Fase 07a): segunda política del pipeline. Si la sesión (conversación + versión)
 * ya respondió `AGENTE_TOPE_TURNOS` turnos, deriva a un asesor con el texto de handoff del horario
 * y no deja que se llame al generador de contenido. Una sesión nueva (otra versión) arranca de cero.
 * La respuesta de derivación no cuenta como turno: tras ella la conversación deja de ser `bot`.
 */
@Injectable()
export class PoliticaTopeTurnos implements PoliticaTurno {
  constructor(
    @Inject(CONTADORES_SESION) private readonly contadores: ContadoresSesion,
    @Inject(CONFIGURACION) private readonly configuracion: Pick<Configuracion, 'AGENTE_TOPE_TURNOS'>,
    private readonly textoHandoff: TextoHandoff,
  ) {}

  async evaluar(solicitud: SolicitudTurno): Promise<DecisionPolitica> {
    const { conversacionId, version } = solicitud.contexto;
    const turnos = await this.contadores.turnos({ conversacionId, version });
    if (turnos < this.configuracion.AGENTE_TOPE_TURNOS) {
      return { decision: 'seguir' };
    }
    return {
      decision: 'responder',
      respuesta: {
        pasos: [{ paso: 'handoff-1', tipo: 'texto', texto: await this.textoHandoff.obtener() }],
        handoff: { motivo: 'tope-turnos' },
      },
      cuentaTurno: false,
    };
  }
}
