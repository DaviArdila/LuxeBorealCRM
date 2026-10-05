import { createOpenAI } from '@ai-sdk/openai';
import type { Configuracion } from '../../../../plataforma/config/index.js';
import type { UsoReportado } from '../../dominio/tipos-llm.js';
import type { ProveedorLlm, UsoSdk } from '../adaptador-ai-sdk.js';

/** Configuración que necesita el proveedor OpenAI (LLM17: la clave la exige `plataforma/config`). */
export type ConfigProveedorOpenAi = Pick<Configuracion, 'OPENAI_API_KEY'>;

/** Ajustes que no vienen de la configuración de la aplicación. */
export interface OpcionesProveedorOpenAi {
  /** Solo para pruebas contra un servidor local: en producción se usa la URL oficial de OpenAI. */
  readonly baseURL?: string;
}

/**
 * Proveedor OpenAI directo, con la clave propia del negocio (ADR-0019), y único archivo que importa
 * `@ai-sdk/openai` (LLM20). El modelo usa la API Responses, la que el SDK elige por defecto. La clave
 * se entrega siempre explícita, así el SDK no la busca en el entorno del proceso.
 *
 * Uso y caché (LLM18): el SDK informa `inputTokens` con los tokens servidos desde caché incluidos y
 * los separa en `inputTokenDetails.cacheReadTokens` (`input_tokens_details.cached_tokens` de la API).
 * Verificado en el código de `@ai-sdk/openai` 4.0.81 y contra un servidor local; contra la API real
 * queda a confirmar en T10.
 */
export function crearProveedorOpenAi(
  configuracion: ConfigProveedorOpenAi,
  opciones: OpcionesProveedorOpenAi = {},
): ProveedorLlm {
  const openai = createOpenAI({
    apiKey: configuracion.OPENAI_API_KEY,
    ...(opciones.baseURL === undefined ? {} : { baseURL: opciones.baseURL }),
  });
  return {
    nombre: 'openai',
    crearModelo: (modelo) => openai(modelo),
    normalizarUso(usoSdk: UsoSdk): UsoReportado {
      const tokensCache = usoSdk.inputTokenDetails.cacheReadTokens ?? 0;
      return {
        tokensEntrada: Math.max(0, (usoSdk.inputTokens ?? 0) - tokensCache),
        tokensSalida: usoSdk.outputTokens ?? 0,
        tokensCache,
      };
    },
  };
}
