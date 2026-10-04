/**
 * Resolución del proveedor de un modelo por su prefijo `proveedor:modelo` (LLM15, LLM16, D2).
 * La lógica es pura y vive en `compartido/llm` para que `plataforma/config` la comparta sin
 * importar de `modulos/`; este archivo es el punto de entrada del dominio de `llm`.
 */
export {
  PROVEEDOR_LLM_POR_DEFECTO,
  PROVEEDORES_LLM_REGISTRADOS,
  prefijoNoRegistrado,
  resolverModelo,
  type ModeloResuelto,
} from '../../../compartido/llm/index.js';
