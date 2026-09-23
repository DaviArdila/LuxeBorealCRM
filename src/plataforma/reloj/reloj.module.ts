import { Global, Module } from '@nestjs/common';
import { CLOCK } from './clock.js';
import { ClockSistema } from './clock-sistema.js';

/**
 * Módulo global del puerto {@link Clock} (PLT2). Registra {@link ClockSistema} bajo el token
 * {@link CLOCK}; ningún otro módulo necesita reexportarlo manualmente.
 */
@Global()
@Module({
  providers: [{ provide: CLOCK, useClass: ClockSistema }],
  exports: [CLOCK],
})
export class RelojModule {}
