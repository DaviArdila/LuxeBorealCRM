import type { Configuracion } from '../../../plataforma/config/index.js';
import { resolverModelo, PROVEEDORES_LLM_REGISTRADOS } from '../dominio/resolver-modelo.js';
import type { ProveedorLlm } from './adaptador-ai-sdk.js';
import { crearProveedorOpenAi } from './proveedores/openai.js';
import { crearProveedorOpenRouter } from './proveedores/openrouter.js';

/** Lo que la fábrica lee de la configuración: los perfiles y las claves de cada proveedor. */
export type ConfigFabricaProveedores = Pick<
  Configuracion,
  | 'LLM_CONVERSACION_MODELOS'
  | 'LLM_EVALS_MODELOS'
  | 'OPENROUTER_API_KEY'
  | 'OPENROUTER_BASE_URL'
  | 'OPENAI_API_KEY'
>;

// Sumar un proveedor es añadir su nombre a `PROVEEDORES_LLM_REGISTRADOS` y su constructor aquí; el
// test de la fábrica falla si una de las dos listas se queda atrás.
const CONSTRUCTORES: Readonly<Record<string, (config: ConfigFabricaProveedores) => ProveedorLlm>> = {
  openrouter: crearProveedorOpenRouter,
  openai: crearProveedorOpenAi,
};

/** Nombres de los proveedores que la fábrica sabe construir. */
export const NOMBRES_DE_PROVEEDORES_CONSTRUIBLES: readonly string[] = Object.keys(CONSTRUCTORES);

/**
 * Construye solo los proveedores que algún perfil referencia (D3, LLM17): uno que ningún modelo usa
 * no se instancia y no necesita clave. Un id sin prefijo cuenta como OpenRouter (LLM15). El orden es
 * el de `PROVEEDORES_LLM_REGISTRADOS`, no el de los perfiles.
 */
export function crearProveedoresUsados(config: ConfigFabricaProveedores): ProveedorLlm[] {
  const usados = new Set(
    [...config.LLM_CONVERSACION_MODELOS, ...config.LLM_EVALS_MODELOS].map(
      (id) => resolverModelo(id, PROVEEDORES_LLM_REGISTRADOS).proveedor,
    ),
  );
  return PROVEEDORES_LLM_REGISTRADOS.filter((nombre) => usados.has(nombre)).map((nombre) => {
    const constructor = CONSTRUCTORES[nombre];
    if (constructor === undefined) {
      throw new Error(`Proveedor de LLM sin constructor: ${nombre}`);
    }
    return constructor(config);
  });
}
