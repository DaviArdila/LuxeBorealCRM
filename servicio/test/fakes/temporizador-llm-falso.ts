import type { TemporizadorLlm } from '../../src/modulos/llm/puertos/temporizador-llm.js';
import type { ClockFalso } from './clock-falso.js';

/**
 * Doble de test de {@link TemporizadorLlm}: `esperar` no duerme, avanza el `ClockFalso` y deja la
 * espera registrada; `azar` es fijo; `programar` usa un temporizador real (los timeouts de los tests
 * son de decenas de milisegundos) y deja registrado el plazo pedido.
 */
export class TemporizadorLlmFalso implements TemporizadorLlm {
  readonly esperas: number[] = [];
  readonly programaciones: number[] = [];
  azarFijo = 0;

  constructor(private readonly clock: ClockFalso) {}

  esperar(ms: number): Promise<void> {
    this.esperas.push(ms);
    this.clock.avanzar(ms);
    return Promise.resolve();
  }

  azar(): number {
    return this.azarFijo;
  }

  programar(ms: number, accion: () => void): () => void {
    this.programaciones.push(ms);
    const temporizador = setTimeout(accion, ms);
    return () => clearTimeout(temporizador);
  }
}
