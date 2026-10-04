import { Module } from '@nestjs/common';
import { RegistroObservadoresEspera } from './aplicacion/registro-observadores-espera.js';
import { RegistroObservadoresHandoff } from './aplicacion/registro-observadores-handoff.js';

/**
 * Módulo mínimo que aloja el registro de observadores de handoff (D7 de la Fase 08). Va aparte de
 * `ConversacionesModule` para que un módulo de arriba (`leads`) lo importe y se registre sin importar
 * ni instanciar todo `conversaciones`; Nest comparte el mismo singleton entre quien notifica
 * (`ProcesarTurno`) y quien observa. Desde la Fase 08d aloja también el registro de observadores de espera del
 * cliente (`RegistroObservadoresEspera`, NTF7): es el mismo patrón y el mismo motivo.
 */
@Module({
  providers: [RegistroObservadoresHandoff, RegistroObservadoresEspera],
  exports: [RegistroObservadoresHandoff, RegistroObservadoresEspera],
})
export class ObservadoresHandoffModule {}
