export interface FilaUsoLlm {
  readonly proveedor: string;
  readonly modelo: string;
  readonly tokensEntrada: number;
  readonly tokensSalida: number;
  readonly tokensCache: number;
  readonly costoEstimadoUsd: number;
  readonly latenciaMs: number;
  readonly exito: boolean;
  readonly conversacionId?: string;
}

export interface GastoPorModelo {
  readonly proveedor: string;
  readonly modelo: string;
  readonly costoUsd: number;
}

export const REPOSITORIO_USO_LLM = Symbol('REPOSITORIO_USO_LLM');

// `registrarUso` es best-effort: nunca lanza al gateway (LLM13, nunca-perder > nunca-duplicar).
export interface RepositorioUsoLlm {
  registrarUso(fila: FilaUsoLlm): Promise<void>;
  gastoMensual(desde: Date): Promise<number>;
  gastoMensualPorModelo(desde: Date): Promise<readonly GastoPorModelo[]>;
}
