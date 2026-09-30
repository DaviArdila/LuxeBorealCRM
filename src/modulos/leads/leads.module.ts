import { Module } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { HorarioModule } from '../horario/index.js';
import { EvaluarPropuestaLead } from './aplicacion/evaluar-propuesta-lead.js';
import { RepositorioLeadPrisma } from './infraestructura/prisma/repositorio-lead-prisma.js';
import { REPOSITORIO_LEAD } from './puertos/repositorio-lead.js';

/**
 * Módulo de leads (Fase 08): dueño de la tabla `lead`, de la escala determinista (R9) y, en las tareas
 * siguientes, de la captura fuera de horario y del aviso al asesor. Depende de `horario` para saber si
 * hay asesores. `CLOCK` es global. Lo consume `agente` por su barril.
 */
@Module({
  imports: [PrismaModule, HorarioModule],
  providers: [{ provide: REPOSITORIO_LEAD, useClass: RepositorioLeadPrisma }, EvaluarPropuestaLead],
  exports: [EvaluarPropuestaLead],
})
export class LeadsModule {}
