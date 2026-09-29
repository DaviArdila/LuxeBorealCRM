import type { Configuracion } from '../../src/plataforma/config/index.js';

type CamposLlm = Extract<keyof Configuracion, `LLM_${string}` | `OPENROUTER_${string}`>;

// Los tests que arman una `Configuracion` completa a mano expanden este bloque en vez de repetir
// las variables `LLM_*`/`OPENROUTER_*` (T3 de la Fase 06): una variable nueva se agrega aquí una vez.
export const CONFIGURACION_LLM_DE_PRUEBA: Pick<Configuracion, CamposLlm> = {
  LLM_CONVERSACION_MODELOS: ['openai/gpt-5.6-luna'],
  LLM_CONVERSACION_TIMEOUT_MS: 15000,
  LLM_CONVERSACION_MAX_TOKENS: 400,
  LLM_CONVERSACION_MAX_REINTENTOS: 2,
  LLM_EVALS_MODELOS: ['openai/gpt-5.6-luna'],
  LLM_EVALS_TIMEOUT_MS: 30000,
  LLM_EVALS_MAX_TOKENS: 400,
  LLM_EVALS_MAX_REINTENTOS: 2,
  LLM_TECHO_MENSUAL_USD: 10,
  LLM_UMBRAL_AVISO_PCT: 80,
  LLM_PRECIOS_USD_JSON: { 'openai/gpt-5.6-luna': { entrada: 0.2, salida: 1.2, cache: 0.02 } },
  LLM_REINTENTO_BASE_MS: 500,
  LLM_REINTENTO_MAX_MS: 2000,
  LLM_CB_UMBRAL_FALLOS: 5,
  LLM_CB_VENTANA_S: 60,
  OPENROUTER_API_KEY: '',
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
};
