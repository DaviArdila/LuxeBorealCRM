import { Module } from '@nestjs/common';
import { RegistroObservadoresHandoff } from './aplicacion/registro-observadores-handoff.js';

/**
 * Módulo mínimo que aloja el registro de observadores de handoff (D7 de la Fase 08). Va aparte de
 * `ConversacionesModule` para que un módulo de arriba (`leads`) lo importe y se registre sin importar
 * ni instanciar todo `conversaciones`; Nest comparte el mismo singleton entre quien notifica
 * (`ProcesarTurno`) y quien observa.
 */
@Module({ providers: [RegistroObservadoresHandoff], exports: [RegistroObservadoresHandoff] })
export class ObservadoresHandoffModule {}
