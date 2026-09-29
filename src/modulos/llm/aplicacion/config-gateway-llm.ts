import type { Configuracion } from '../../../plataforma/config/index.js';

// Solo lo que el gateway lee de la `Configuracion`: los tests arman este subconjunto sin tener que
// completar las ~55 variables de la aplicación.
export type ConfigGatewayLlm = Pick<
  Configuracion,
  Extract<keyof Configuracion, `LLM_${string}`> | 'LOCK_TURNO_TTL_S' | 'NODE_ENV'
>;
