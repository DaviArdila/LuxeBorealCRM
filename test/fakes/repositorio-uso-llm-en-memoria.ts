import type {
  FilaUsoLlm,
  GastoPorModelo,
  RepositorioUsoLlm,
} from '../../src/modulos/llm/puertos/repositorio-uso-llm.js';

/** Doble de test de {@link RepositorioUsoLlm}: guarda las filas en memoria y las deja a la vista. */
export class RepositorioUsoLlmEnMemoria implements RepositorioUsoLlm {
  readonly filas: FilaUsoLlm[] = [];
  // Instantes `desde` con los que el gateway pidió el gasto del mes.
  readonly consultas: Date[] = [];
  gastoMensualUsd = 0;
  fallaElGasto = false;

  registrarUso(fila: FilaUsoLlm): Promise<void> {
    this.filas.push(fila);
    return Promise.resolve();
  }

  gastoMensual(desde: Date): Promise<number> {
    this.consultas.push(desde);
    if (this.fallaElGasto) {
      return Promise.reject(new Error('base no disponible'));
    }
    return Promise.resolve(this.gastoMensualUsd);
  }

  gastoMensualPorModelo(): Promise<readonly GastoPorModelo[]> {
    return Promise.resolve([]);
  }
}
