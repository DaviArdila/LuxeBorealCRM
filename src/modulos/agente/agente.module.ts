import { Module } from '@nestjs/common';
import { GENERADOR_RESPUESTA } from '../conversaciones/index.js';
import { MotorTurno } from './aplicacion/motor-turno.js';
import { ContenidoEcoProvisional } from './aplicacion/politicas/contenido-eco-provisional.js';
import { POLITICAS_TURNO } from './dominio/politica-turno.js';

/**
 * Módulo del agente (Fase 07a, ADR-0016): implementa el puerto `GENERADOR_RESPUESTA` que define
 * `conversaciones` y lo exporta para que `AppModule` lo componga con
 * `ConversacionesModule.conGenerador(AgenteModule)`. Nunca importa `canales` (regla 13): pide
 * pasos y handoff, y `conversaciones` los ejecuta.
 *
 * El orden de `POLITICAS_TURNO` es el del pipeline (AGT1): hoy solo el contenido provisional; las
 * políticas de no textuales (R12) y de tope de turnos (R13) se anteponen en las tareas siguientes.
 */
@Module({
  providers: [
    ContenidoEcoProvisional,
    {
      provide: POLITICAS_TURNO,
      useFactory: (contenido: ContenidoEcoProvisional) => [contenido],
      inject: [ContenidoEcoProvisional],
    },
    { provide: GENERADOR_RESPUESTA, useClass: MotorTurno },
  ],
  exports: [GENERADOR_RESPUESTA],
})
export class AgenteModule {}
