import type { Clock } from '../../src/plataforma/reloj/index.js';

/**
 * Doble de test del puerto {@link Clock} (PLT2). Permite fijar una fecha exacta y avanzarla sin
 * tocar el reloj del sistema real ni depender de `vi.useFakeTimers` sobre lógica de negocio.
 */
export class ClockFalso implements Clock {
  private fecha: Date;

  constructor(fechaInicial: Date = new Date(0)) {
    this.fecha = fechaInicial;
  }

  ahora(): Date {
    return this.fecha;
  }

  /** Fija la fecha exacta que devolverá {@link ahora} hasta el próximo `fijar`/`avanzar`. */
  fijar(fecha: Date): void {
    this.fecha = fecha;
  }

  /** Desplaza la fecha fijada `ms` milisegundos (puede ser negativo). */
  avanzar(ms: number): void {
    this.fecha = new Date(this.fecha.getTime() + ms);
  }
}
