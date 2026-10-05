/**
 * Resolución pura del proveedor de un modelo de LLM (LLM15, LLM16, D2 de
 * `proveedores-llm-configurables`). Vive en `compartido/` porque la usan a la vez `modulos/llm`
 * y `plataforma/config`, y `plataforma/` no puede importar de `modulos/`; así la lista de
 * proveedores y la regla de prefijo se declaran una sola vez.
 */

/** Proveedor al que va todo id sin prefijo registrado (comportamiento previo a ADR-0019). */
export const PROVEEDOR_LLM_POR_DEFECTO = 'openrouter';

/**
 * Proveedores de LLM con adaptador implementado. Anthropic, Google y compatible quedan pospuestos
 * (P37): sumarlos es añadir su nombre aquí junto a su archivo de proveedor.
 */
export const PROVEEDORES_LLM_REGISTRADOS: readonly string[] = ['openrouter', 'openai'];

/** Resultado de {@link resolverModelo}: proveedor a llamar e id de modelo que se le envía. */
export interface ModeloResuelto {
  readonly proveedor: string;
  readonly modelo: string;
}

/**
 * Prefijo `proveedor` de un id `proveedor:modelo` (primera `:`), o `null` si el id no tiene forma
 * de prefijo: sin `:`, con prefijo vacío o con `/` en el prefijo (ids de OpenRouter como
 * `meta-llama/llama-3-8b:free`).
 */
function prefijoDe(idModelo: string): string | null {
  const posicion = idModelo.indexOf(':');
  if (posicion <= 0) return null;
  const prefijo = idModelo.slice(0, posicion);
  return prefijo.includes('/') ? null : prefijo;
}

/**
 * Resuelve a qué proveedor va un id de modelo. El prefijo solo cuenta si es un proveedor de
 * `proveedoresRegistrados` y no contiene `/`; sin prefijo válido el id completo, intacto, va a
 * OpenRouter.
 */
export function resolverModelo(
  idModelo: string,
  proveedoresRegistrados: readonly string[],
): ModeloResuelto {
  const prefijo = prefijoDe(idModelo);
  if (prefijo !== null && proveedoresRegistrados.includes(prefijo)) {
    return { proveedor: prefijo, modelo: idModelo.slice(prefijo.length + 1) };
  }
  return { proveedor: PROVEEDOR_LLM_POR_DEFECTO, modelo: idModelo };
}

/**
 * Prefijo con forma de proveedor (`x:modelo`, sin `/`) que no está registrado, o `null`. La
 * configuración lo usa para impedir el arranque con un prefijo mal escrito (LLM16) en lugar de
 * enviar el id a OpenRouter.
 */
export function prefijoNoRegistrado(
  idModelo: string,
  proveedoresRegistrados: readonly string[],
): string | null {
  const prefijo = prefijoDe(idModelo);
  return prefijo !== null && !proveedoresRegistrados.includes(prefijo) ? prefijo : null;
}
