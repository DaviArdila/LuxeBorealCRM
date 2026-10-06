import { Inject, Injectable } from '@nestjs/common';
import { HORARIO, type Horario } from '../../horario/index.js';
import { TEXTOS_ASISTENTE, type TextosAsistente } from '../../asistente/index.js';

/**
 * Texto que el cliente ve cuando el agente lo pasa a un asesor (AGT3): `mensaje_handoff` dentro del
 * horario de atención y `mensaje_handoff_fuera_horario` fuera de él. Lo comparten las políticas que
 * derivan (audio repetido, tope de turnos), así el criterio de horario vive en un solo lugar.
 */
@Injectable()
export class TextoHandoff {
  constructor(
    @Inject(HORARIO) private readonly horario: Horario,
    @Inject(TEXTOS_ASISTENTE) private readonly textos: TextosAsistente,
  ) {}

  async obtener(): Promise<string> {
    const dentro = await this.horario.estaDentroDeHorario();
    return this.textos.textoDelSistema(dentro ? 'mensaje_handoff' : 'mensaje_handoff_fuera_horario');
  }
}
