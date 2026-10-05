import type { Clock } from './clock.js';

/**
 * Implementación de sistema del puerto {@link Clock} (PLT2). Único lugar del repositorio
 * autorizado a llamar `new Date()` sin argumentos (regla de lint "Reloj", D10 de `design.md`).
 */
export class ClockSistema implements Clock {
  ahora(): Date {
    return new Date();
  }
}
