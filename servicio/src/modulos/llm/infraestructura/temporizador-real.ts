import { Injectable } from '@nestjs/common';
import type { TemporizadorLlm } from '../puertos/temporizador-llm.js';

/** Implementación de producción de {@link TemporizadorLlm}: `setTimeout` y `Math.random`. */
@Injectable()
export class TemporizadorReal implements TemporizadorLlm {
  esperar(ms: number): Promise<void> {
    return new Promise((resolver) => {
      setTimeout(resolver, ms);
    });
  }

  azar(): number {
    return Math.random();
  }

  programar(ms: number, accion: () => void): () => void {
    const temporizador = setTimeout(accion, ms);
    return () => {
      clearTimeout(temporizador);
    };
  }
}
