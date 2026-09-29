import { Inject, Injectable } from '@nestjs/common';
import type { GeneradorRespuesta, RespuestaTurno, SolicitudTurno } from '../../conversaciones/index.js';
import { anteponerAviso } from '../dominio/aviso-datos.js';
import { POLITICAS_TURNO, type PoliticaTurno } from '../dominio/politica-turno.js';
import { CONTADORES_SESION, type ClaveSesion, type ContadoresSesion } from '../puertos/contadores-sesion.js';
import {
  REPOSITORIO_PARAMETRO_AGENTE,
  type RepositorioParametroAgente,
} from '../puertos/repositorio-parametro-agente.js';

/**
 * Implementación del puerto `GeneradorRespuesta` de `conversaciones` (ADR-0016, D6 de la Fase 07a,
 * AGT1): recorre las políticas en el orden en que el módulo las declara y se detiene en la primera
 * que responde. Un turno que ninguna responde termina sin pasos, que `conversaciones` no envía
 * (CNV8). No transiciona la conversación: el `handoff` que trae la respuesta lo ejecuta ella (R6).
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
    @Inject(REPOSITORIO_PARAMETRO_AGENTE) private readonly parametros: RepositorioParametroAgente,
  ) {}

  async generar(solicitud: SolicitudTurno): Promise<RespuestaTurno> {
    const { conversacionId, version } = solicitud.contexto;
    const sesion = { conversacionId, version };
    for (const politica of this.politicas) {
      const decision = await politica.evaluar(solicitud);
      if (decision.decision === 'responder') {
        const respuesta = await this.conAviso(decision.respuesta, sesion);
        if (decision.cuentaTurno) {
          await this.contadores.registrarTurno(sesion);
        }
        return respuesta;
      }
    }
    return { pasos: [] };
  }

  /** Primer turno de la conversación = versión 0 y ningún turno respondido (D8). */
  private async conAviso(respuesta: RespuestaTurno, sesion: ClaveSesion): Promise<RespuestaTurno> {
    if (respuesta.pasos.length === 0 || sesion.version !== 0 || (await this.contadores.turnos(sesion)) !== 0) {
      return respuesta;
    }
    const aviso = await this.parametros.obtenerTexto('aviso_datos');
    return { ...respuesta, pasos: anteponerAviso(respuesta.pasos, aviso) };
  }
}
