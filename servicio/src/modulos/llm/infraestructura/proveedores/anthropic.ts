import { createAnthropic } from '@ai-sdk/anthropic';
import type { Configuracion } from '../../../../plataforma/config/index.js';
import type { UsoReportado } from '../../dominio/tipos-llm.js';
import type { ProveedorLlm, UsoSdk } from '../adaptador-ai-sdk.js';

/** Configuración que necesita el proveedor Anthropic (LLM17: la clave la exige `plataforma/config`). */
export type ConfigProveedorAnthropic = Pick<Configuracion, 'ANTHROPIC_API_KEY'>;

/** Ajustes que no vienen de la configuración de la aplicación. */
export interface OpcionesProveedorAnthropic {
  /** Solo para pruebas contra un servidor local: en producción se usa la URL oficial de Anthropic. */
  readonly baseURL?: string;
}

// Sin `baseURL` explícita el SDK leería `ANTHROPIC_BASE_URL` del entorno del proceso.
const URL_API_ANTHROPIC = 'https://api.anthropic.com/v1';

/**
 * Proveedor Anthropic directo, con la clave propia del negocio (ADR-0029), y único archivo que importa
 * `@ai-sdk/anthropic` (LLM20). La clave y la URL se entregan siempre explícitas, así el SDK no las busca
 * en el entorno del proceso.
 *
 * Razonamiento (LLM25): los modelos Claude actuales razonan por defecto y ese razonamiento cuenta dentro
 * de `max_tokens`; cada llamada pide `effort: 'low'` (`output_config.effort` de la API). No se envía
 * `thinking` con presupuesto ni `temperature`: los modelos recientes los rechazan.
 *
 * Caché (LLM25): Anthropic no tiene una clave de caché; se marca un punto de corte `cacheControl` en el
 * prompt de sistema, que guarda en caché las herramientas y el sistema (el orden de la API es
 * herramientas → sistema → mensajes).
 *
 * Uso (LLM18): el SDK informa `inputTokens` como la suma de la entrada sin caché, la escritura en caché
 * (`cache_creation_input_tokens`) y la lectura de caché (`cache_read_input_tokens`), y separa la lectura en
 * `inputTokenDetails.cacheReadTokens`. La escritura queda dentro de `tokensEntrada` al precio de entrada:
 * subestima un poco el costo, porque Anthropic la cobra a 1,25 veces la entrada. Verificado en el código de
 * `@ai-sdk/anthropic` 4.0.68 (`convertAnthropicUsage`) y contra un servidor local; contra la API real queda
 * a confirmar con las evals reales.
 */
export function crearProveedorAnthropic(
  configuracion: ConfigProveedorAnthropic,
  opciones: OpcionesProveedorAnthropic = {},
): ProveedorLlm {
  const anthropic = createAnthropic({
    apiKey: configuracion.ANTHROPIC_API_KEY,
    baseURL: opciones.baseURL ?? URL_API_ANTHROPIC,
  });
  return {
    nombre: 'anthropic',
    crearModelo: (modelo) => anthropic(modelo),
    opcionesFijas: { anthropic: { effort: 'low' } },
    opcionesDelSistemaConCache: { anthropic: { cacheControl: { type: 'ephemeral' } } },
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
