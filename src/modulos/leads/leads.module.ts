import { Module, type OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../plataforma/prisma/index.js';
import { ObservadoresHandoffModule, RegistroObservadoresHandoff } from '../conversaciones/index.js';
import { HorarioModule } from '../horario/index.js';
import { NotificacionesModule } from '../notificaciones/index.js';
import { AvisarLead } from './aplicacion/avisar-lead.js';
import { AvisoLeadEnHandoff } from './aplicacion/aviso-lead-en-handoff.js';
import { CompletarCaptura } from './aplicacion/completar-captura.js';
import { EvaluarPropuestaLead } from './aplicacion/evaluar-propuesta-lead.js';
import { ObtenerCapturaPendiente } from './aplicacion/obtener-captura-pendiente.js';
import { RegistrarPidePersona } from './aplicacion/registrar-pide-persona.js';
import { RepositorioLeadPrisma } from './infraestructura/prisma/repositorio-lead-prisma.js';
import { REPOSITORIO_LEAD } from './puertos/repositorio-lead.js';

/**
 * Módulo de leads (Fase 08): dueño de la tabla `lead`, de la escala determinista (R9) y, en las tareas
 * siguientes, de la captura fuera de horario y del aviso al asesor. Depende de `horario` para saber si
 * hay asesores. `CLOCK` es global. Lo consume `agente` por su barril.
 *
 * T6 (NTF1-NTF3): avisa a los asesores con `AvisarLead` (ventana de 24 h por contacto) a través de
 * `notificaciones`, y se registra como observador de handoff en `onModuleInit` (mismo patrón que
 * `CanalesModule`) para avisar solo después de confirmada la transición.
 */
@Module({
  imports: [PrismaModule, HorarioModule, NotificacionesModule, ObservadoresHandoffModule],
  providers: [
    { provide: REPOSITORIO_LEAD, useClass: RepositorioLeadPrisma },
    EvaluarPropuestaLead,
    RegistrarPidePersona,
    ObtenerCapturaPendiente,
    AvisarLead,
    AvisoLeadEnHandoff,
    CompletarCaptura,
  ],
  exports: [EvaluarPropuestaLead, RegistrarPidePersona, ObtenerCapturaPendiente, CompletarCaptura],
})
export class LeadsModule implements OnModuleInit {
  constructor(
    private readonly registroObservadores: RegistroObservadoresHandoff,
    private readonly avisoLeadEnHandoff: AvisoLeadEnHandoff,
  ) {}

  onModuleInit(): void {
    this.registroObservadores.registrar(this.avisoLeadEnHandoff);
  }
}
