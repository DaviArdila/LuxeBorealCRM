import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { Configuracion } from '../../../../plataforma/config/index.js';
import type { UsoReportado } from '../../dominio/tipos-llm.js';
import { esRegistro, type ProveedorLlm, type UsoSdk } from '../adaptador-ai-sdk.js';

/** Configuración que necesita el proveedor OpenRouter (LLM17: la clave la exige `plataforma/config`). */
export type ConfigProveedorOpenRouter = Pick<
  Configuracion,
  'OPENROUTER_API_KEY' | 'OPENROUTER_BASE_URL'
>;

function tokensDeCacheReportados(metadatos: unknown, respaldo: number | undefined): number {
  const uso = esRegistro(metadatos) && esRegistro(metadatos['openrouter'])
    ? metadatos['openrouter']['usage']
    : undefined;
  const detalle = esRegistro(uso) ? uso['promptTokensDetails'] : undefined;
  const cacheado = esRegistro(detalle) ? detalle['cachedTokens'] : undefined;
  return typeof cacheado === 'number' ? cacheado : (respaldo ?? 0);
}

/**
 * Proveedor OpenRouter (ADR-0002) y único archivo que importa `@openrouter/ai-sdk-provider` (LLM20).
 * Es el proveedor por defecto: todo id de modelo sin prefijo registrado va aquí (LLM15).
 */
export function crearProveedorOpenRouter(configuracion: ConfigProveedorOpenRouter): ProveedorLlm {
  const openrouter = createOpenRouter({
    apiKey: configuracion.OPENROUTER_API_KEY,
    baseURL: configuracion.OPENROUTER_BASE_URL,
  });
  return {
    nombre: 'openrouter',
    crearModelo: (modelo) => openrouter(modelo, { usage: { include: true } }),
    // `prompt_tokens` de OpenRouter incluye los tokens servidos desde caché: se separan para que el
    // costo estimado (D6) cobre cada grupo con su precio.
    normalizarUso(usoSdk: UsoSdk, metadatos: unknown): UsoReportado {
      const tokensCache = tokensDeCacheReportados(metadatos, usoSdk.inputTokenDetails.cacheReadTokens);
      return {
        tokensEntrada: Math.max(0, (usoSdk.inputTokens ?? 0) - tokensCache),
        tokensSalida: usoSdk.outputTokens ?? 0,
        tokensCache,
      };
    },
  };
}
