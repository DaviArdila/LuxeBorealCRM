import type { ErrorPasarelaLlm } from '../../src/modulos/llm/dominio/error-pasarela-llm.js';
import type {
  LlmPort,
  RespuestaGeneracion,
  SolicitudGeneracion,
} from '../../src/modulos/llm/puertos/llm-port.js';

export type PasoLlmFalso =
  | { readonly respuesta: RespuestaGeneracion; readonly modelo?: string }
  | { readonly error: ErrorPasarelaLlm };

/**
 * Doble de test del puerto {@link LlmPort} para las Fases 06-07: éxito y error programables en
 * orden, con las solicitudes recibidas y el modelo que respondió cada paso a la vista.
 */
export class FakePuertoLlm implements LlmPort {
  readonly solicitudes: SolicitudGeneracion[] = [];
  readonly modelosUsados: (string | undefined)[] = [];
  private readonly pasos: PasoLlmFalso[] = [];

  encolar(...pasos: PasoLlmFalso[]): void {
    this.pasos.push(...pasos);
  }

  generar(solicitud: SolicitudGeneracion): Promise<RespuestaGeneracion> {
    this.solicitudes.push(solicitud);
    const paso = this.pasos.shift();
    if (paso === undefined) {
      return Promise.reject(new Error('FakePuertoLlm: no hay pasos programados'));
    }
    if ('error' in paso) {
      return Promise.reject(paso.error);
    }
    this.modelosUsados.push(paso.modelo);
    return Promise.resolve(paso.respuesta);
  }
}
