import { AdaptadorEnrutador } from '../../src/modulos/llm/infraestructura/adaptador-enrutador.js';
import { crearProveedorOpenAi } from '../../src/modulos/llm/infraestructura/proveedores/openai.js';
import { ADAPTADOR_LLM, type AdaptadorLlm } from '../../src/modulos/llm/puertos/adaptador-llm.js';
import { CONFIGURACION, type Configuracion } from '../../src/plataforma/config/index.js';

export { ADAPTADOR_LLM };

/**
 * Sustituto de `ADAPTADOR_LLM` para los tests que componen `LlmModule`, con la forma que espera
 * `overrideProvider(ADAPTADOR_LLM).useFactory(...)`: el enrutador real con el proveedor `openai`
 * apuntado a un `SimuladorOpenAi`. La URL de un proveedor directo no es configuración de la aplicación
 * (ADR-0019), así que el simulador se cablea por DI y no por una variable de entorno. La clave sale de
 * la configuración del módulo, como en producción.
 */
export function adaptadorLlmContraSimuladorOpenAi(urlOpenAi: string) {
  return {
    inject: [CONFIGURACION],
    factory: (configuracion: Configuracion): AdaptadorLlm =>
      new AdaptadorEnrutador([crearProveedorOpenAi(configuracion, { baseURL: urlOpenAi })]),
  };
}
