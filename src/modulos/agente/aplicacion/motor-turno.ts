import { Inject, Injectable } from '@nestjs/common';
import type { GeneradorRespuesta, RespuestaTurno, SolicitudTurno } from '../../conversaciones/index.js';
import { POLITICAS_TURNO, type PoliticaTurno } from '../dominio/politica-turno.js';

/**
 * Implementación del puerto `GeneradorRespuesta` de `conversaciones` (ADR-0016, D6 de la Fase 07a,
 * AGT1): recorre las políticas en el orden en que el módulo las declara y se detiene en la primera
 * que responde. Un turno que ninguna responde termina sin pasos, que `conversaciones` no envía
 * (CNV8). No transiciona la conversación: el `handoff` que trae la respuesta lo ejecuta ella (R6).
 */
@Injectable()
export class MotorTurno implements GeneradorRespuesta {
  constructor(@Inject(POLITICAS_TURNO) private readonly politicas: readonly PoliticaTurno[]) {}

  async generar(solicitud: SolicitudTurno): Promise<RespuestaTurno> {
    for (const politica of this.politicas) {
      const decision = await politica.evaluar(solicitud);
      if (decision.decision === 'responder') {
        return decision.respuesta;
      }
    }
    return { pasos: [] };
  }
}
