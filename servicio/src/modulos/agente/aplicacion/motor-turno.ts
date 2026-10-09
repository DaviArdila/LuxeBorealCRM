import { Inject, Injectable } from '@nestjs/common';
import type { GeneradorRespuesta, RespuestaTurno, SolicitudTurno } from '../../conversaciones/index.js';
import { anteponerAviso } from '../dominio/aviso-datos.js';
import { elegirAviso } from '../dominio/prioridad-aviso.js';
import { POLITICAS_TURNO, type EstadoTurno, type PoliticaTurno } from '../dominio/politica-turno.js';
import { CONTADORES_SESION, type ClaveSesion, type ContadoresSesion } from '../puertos/contadores-sesion.js';
import { TEXTOS_ASISTENTE, type TextosAsistente } from '../../asistente/index.js';

/**
 * Implementación del puerto `GeneradorRespuesta` de `conversaciones` (ADR-0016, D6 de la Fase 07a,
 * AGT1): recorre las políticas en el orden en que el módulo las declara y se detiene en la primera
 * que responde. Un turno que ninguna responde termina sin pasos, que `conversaciones` no envía
 * (CNV8). No transiciona la conversación: el `handoff` que trae la respuesta lo ejecuta ella (R6).
 * Una política que deja pasar puede pedir un aviso al asesor en el {@link EstadoTurno}: el motor lo suma a la
 * respuesta final (AGT1, D2 de la Fase 12d), con un solo aviso por turno y sin avisar si la respuesta pide handoff.
 *
 * Sobre la respuesta que sale de cualquier política, el motor decide en un solo lugar dos cosas de
 * la sesión (D8): si es la primera respuesta de la conversación antepone el aviso de datos (AGT2,
 * R14) y, si la política dijo `cuentaTurno`, registra el turno (R13).
 */
@Injectable()
export class MotorTurno implements GeneradorRespuesta {
  constructor(
    @Inject(POLITICAS_TURNO) private readonly politicas: readonly PoliticaTurno[],
    @Inject(CONTADORES_SESION) private readonly contadores: ContadoresSesion,
    @Inject(TEXTOS_ASISTENTE) private readonly textos: TextosAsistente,
  ) {}

  async generar(solicitud: SolicitudTurno): Promise<RespuestaTurno> {
    const { conversacionId, version } = solicitud.contexto;
    const sesion = { conversacionId, version };
    const turno: EstadoTurno = {};
    for (const politica of this.politicas) {
      const decision = await politica.evaluar(solicitud, turno);
      if (decision.decision === 'responder') {
        const respuesta = await this.conAviso(this.conAvisoAlAsesor(decision.respuesta, turno), sesion);
        if (decision.cuentaTurno) {
          await this.contadores.registrarTurno(sesion);
        }
        return respuesta;
      }
    }
    return { pasos: [] };
  }

  /** D2 de la Fase 12d: suma el aviso que pidió una política al que ya trae la respuesta y deja el de mayor prioridad. */
  private conAvisoAlAsesor(respuesta: RespuestaTurno, turno: EstadoTurno): RespuestaTurno {
    if (respuesta.handoff !== undefined) {
      return respuesta;
    }
    const motivo = elegirAviso([respuesta.aviso?.motivo, turno.avisoPedido]);
    return motivo === undefined ? respuesta : { ...respuesta, aviso: { motivo } };
  }

  /** Primer turno de la conversación = versión 0 y ningún turno respondido (D8). */
  private async conAviso(respuesta: RespuestaTurno, sesion: ClaveSesion): Promise<RespuestaTurno> {
    if (respuesta.pasos.length === 0 || sesion.version !== 0 || (await this.contadores.turnos(sesion)) !== 0) {
      return respuesta;
    }
    const aviso = await this.textos.textoDelSistema('aviso_datos');
    return { ...respuesta, pasos: anteponerAviso(respuesta.pasos, aviso) };
  }
}
