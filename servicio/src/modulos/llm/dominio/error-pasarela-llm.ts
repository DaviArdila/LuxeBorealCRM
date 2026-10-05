export const CODIGOS_ERROR_PASARELA = [
  'timeout',
  'no-reintentable',
  'circuito-abierto',
  'techo-alcanzado',
  'proveedor-caido',
] as const;

export type CodigoErrorPasarela = (typeof CODIGOS_ERROR_PASARELA)[number];

export class ErrorPasarelaLlm extends Error {
  readonly codigo: CodigoErrorPasarela;
  // Último modelo intentado; ausente si nunca hubo llamada al proveedor.
  readonly modelo?: string;

  constructor(codigo: CodigoErrorPasarela, modelo?: string) {
    super(modelo === undefined ? `Pasarela LLM: ${codigo}` : `Pasarela LLM: ${codigo} (${modelo})`);
    this.name = 'ErrorPasarelaLlm';
    this.codigo = codigo;
    if (modelo !== undefined) {
      this.modelo = modelo;
    }
  }
}
