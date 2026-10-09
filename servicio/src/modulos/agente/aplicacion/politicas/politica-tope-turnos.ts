import { Inject, Injectable } from '@nestjs/common';
import type { SolicitudTurno } from '../../../conversaciones/index.js';
import { CONFIGURACION, type Configuracion } from '../../../../plataforma/config/index.js';
import { TEXTOS_ASISTENTE, type TextosAsistente } from '../../../asistente/index.js';
import type { DecisionPolitica, PoliticaTurno } from '../../dominio/politica-turno.js';
import { CONTADORES_SESION, type ContadoresSesion } from '../../puertos/contadores-sesion.js';

/**
 * R13 (D6 de la Fase 07a, AGT3): segunda política del pipeline. Si la sesión (conversación + versión)
 * ya respondió `AGENTE_TOPE_TURNOS` turnos (20 por defecto, P65), responde con el texto de espera
 * (`mensaje_espera_handoff`, el mismo dentro y fuera de horario) y pide el handoff `tope-turnos`: la
 * conversación pasa a `handoff_pendiente` y `notificaciones` avisa al asesor. No llama al generador de contenido.
 * Una sesión nueva (otra versión) arranca de cero. La respuesta no cuenta como turno: tras ella la
 * conversación deja de ser `bot`.
 */
@Injectable()
export class PoliticaTopeTurnos implements PoliticaTurno {
  constructor(
    @Inject(CONTADORES_SESION) private readonly contadores: ContadoresSesion,
    @Inject(CONFIGURACION) private readonly configuracion: Pick<Configuracion, 'AGENTE_TOPE_TURNOS'>,
    @Inject(TEXTOS_ASISTENTE) private readonly textos: TextosAsistente,
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
        pasos: [{ paso: 'handoff-1', tipo: 'texto', texto: await this.textos.textoDelSistema('mensaje_espera_handoff') }],
        handoff: { motivo: 'tope-turnos' },
      },
      cuentaTurno: false,
    };
  }
}
