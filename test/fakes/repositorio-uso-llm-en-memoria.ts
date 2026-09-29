import type {
  FilaUsoLlm,
  GastoPorModelo,
  RepositorioUsoLlm,
} from '../../src/modulos/llm/puertos/repositorio-uso-llm.js';

/** Doble de test de {@link RepositorioUsoLlm}: guarda las filas en memoria y las deja a la vista. */
export class RepositorioUsoLlmEnMemoria implements RepositorioUsoLlm {
  readonly filas: FilaUsoLlm[] = [];
  gastoMensualUsd = 0;

  registrarUso(fila: FilaUsoLlm): Promise<void> {
    this.filas.push(fila);
    return Promise.resolve();
  }

  gastoMensual(): Promise<number> {
    return Promise.resolve(this.gastoMensualUsd);
  }

  gastoMensualPorModelo(): Promise<readonly GastoPorModelo[]> {
    return Promise.resolve([]);
  }
}
