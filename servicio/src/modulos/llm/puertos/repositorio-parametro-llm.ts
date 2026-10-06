export interface EstadoTecho {
  readonly mes: string;
  readonly gastoUsd: number;
  readonly techoUsd: number;
  readonly avisoEmitido: boolean;
  readonly bloqueado: boolean;
}

export const REPOSITORIO_PARAMETRO_LLM = Symbol('REPOSITORIO_PARAMETRO_LLM');

// «No configurado» nunca lanza: el techo cae al del entorno y el estado se lee como ausente (R15, D9).
export interface RepositorioParametroLlm {
  // Techo mensual en USD guardado por el negocio; `null` si no está configurado y rige el del entorno.
  obtenerTechoMensualUsd(): Promise<number | null>;
  leerEstadoTecho(): Promise<EstadoTecho | null>;
  guardarEstadoTecho(estado: EstadoTecho): Promise<void>;
}
