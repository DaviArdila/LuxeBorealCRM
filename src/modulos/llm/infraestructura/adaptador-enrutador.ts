import { PROVEEDORES_LLM_REGISTRADOS, resolverModelo } from '../dominio/resolver-modelo.js';
import type { SolicitudGeneracion } from '../puertos/llm-port.js';
import type {
  AdaptadorLlm,
  LimiteIntento,
  ResultadoAdaptador,
} from '../puertos/adaptador-llm.js';
import { AdaptadorAiSdk, type ProveedorLlm } from './adaptador-ai-sdk.js';

/**
 * Implementación del puerto {@link AdaptadorLlm} (LLM15, D3 de `proveedores-llm-configurables`):
 * resuelve el proveedor del id de modelo por su prefijo y delega en el adaptador genérico con ese
 * proveedor y el id que sigue al prefijo. No reintenta ni clasifica: un intento por llamada y el error
 * sube tal cual al gateway, que decide reintento, fallback y circuito.
 */
export class AdaptadorEnrutador implements AdaptadorLlm {
  private readonly proveedores: ReadonlyMap<string, ProveedorLlm>;

  constructor(
    proveedores: readonly ProveedorLlm[],
    private readonly generico: AdaptadorAiSdk = new AdaptadorAiSdk(),
  ) {
    this.proveedores = new Map(proveedores.map((proveedor) => [proveedor.nombre, proveedor]));
  }

  generarConModelo(
    idModelo: string,
    solicitud: SolicitudGeneracion,
    limite: LimiteIntento,
  ): Promise<ResultadoAdaptador> {
    const { proveedor: nombre, modelo } = resolverModelo(idModelo, PROVEEDORES_LLM_REGISTRADOS);
    const proveedor = this.proveedores.get(nombre);
    if (proveedor === undefined) {
      // La configuración solo construye los proveedores que algún perfil usa (LLM17), así que esto
      // indica un id que no pasó por ella. El mensaje nombra el proveedor, nunca una clave.
      return Promise.reject(new Error(`Proveedor de LLM no construido: ${nombre}`));
    }
    return this.generico.generarConModelo(proveedor, modelo, solicitud, limite);
  }
}
