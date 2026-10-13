/**
 * Resolución pura del proveedor de un modelo de LLM (LLM15, LLM16, LLM26; ADR-0029). Vive en
 * `compartido/` porque la usan a la vez `modulos/llm` y `plataforma/config`, y `plataforma/` no
 * puede importar de `modulos/`; así la lista de proveedores y la regla de prefijo se declaran una
 * sola vez.
 */

/**
 * Proveedores de LLM con adaptador implementado: solo directos (ADR-0029, P37). OpenRouter se
 * retiró el 2026-10-13. Google y el compatible con OpenAI siguen pospuestos: sumarlos es añadir su
 * nombre aquí junto a su archivo de proveedor.
 */
export const PROVEEDORES_LLM_REGISTRADOS: readonly string[] = ['openai', 'anthropic'];

/** Resultado de {@link resolverModelo}: proveedor a llamar e id de modelo que se le envía. */
export interface ModeloResuelto {
  readonly proveedor: string;
  readonly modelo: string;
}

/** Prefijo de un id `proveedor:modelo` (hasta la primera `:`), o `null` si no tiene uno. */
function prefijoDe(idModelo: string): string | null {
  const posicion = idModelo.indexOf(':');
  return posicion <= 0 ? null : idModelo.slice(0, posicion);
}

/**
 * Indica si el id tiene la forma `proveedor:modelo` con un proveedor de `proveedoresRegistrados`
 * (LLM26). La configuración lo usa para impedir el arranque con un id que no sabría a quién llamar.
 */
export function tieneProveedorRegistrado(
  idModelo: string,
  proveedoresRegistrados: readonly string[],
): boolean {
  const prefijo = prefijoDe(idModelo);
  return prefijo !== null && proveedoresRegistrados.includes(prefijo);
}

/**
 * Resuelve a qué proveedor va un id de modelo `proveedor:modelo`. No hay proveedor por defecto
 * (LLM26): un id sin prefijo registrado lanza un error que nombra el id y los proveedores
 * admitidos. La configuración ya lo rechaza al arrancar; el error protege a quien llame sin ella.
 */
export function resolverModelo(
  idModelo: string,
  proveedoresRegistrados: readonly string[],
): ModeloResuelto {
  if (!tieneProveedorRegistrado(idModelo, proveedoresRegistrados)) {
    const admitidos = proveedoresRegistrados.map((nombre) => `${nombre}:`).join(', ');
    throw new Error(
      `Id de modelo de LLM sin prefijo de proveedor registrado: "${idModelo}" (se admite ${admitidos}).`,
    );
  }
  const posicion = idModelo.indexOf(':');
  return { proveedor: idModelo.slice(0, posicion), modelo: idModelo.slice(posicion + 1) };
}
