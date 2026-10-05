import type {
  AdaptadorLlm,
  AdaptadorLlmError,
  LimiteIntento,
  ResultadoAdaptador,
} from '../../src/modulos/llm/puertos/adaptador-llm.js';
import type { SolicitudGeneracion } from '../../src/modulos/llm/puertos/llm-port.js';
import type { ClockFalso } from './clock-falso.js';

export type PasoAdaptadorFalso =
  | { readonly resultado: ResultadoAdaptador; readonly tardaMs?: number }
  | { readonly error: AdaptadorLlmError | Error; readonly tardaMs?: number }
  // Nunca responde ni mira la señal de aborto: el gateway debe imponer el timeout por su cuenta.
  | { readonly colgar: true };

export interface LlamadaAdaptadorFalso {
  readonly modelo: string;
  readonly solicitud: SolicitudGeneracion;
  readonly limite: LimiteIntento;
}

/**
 * Doble de test del puerto interno {@link AdaptadorLlm}: pasos programables por modelo, con la
 * duración simulada avanzando el `ClockFalso` (sin esperas reales).
 */
export class FakeAdaptadorLlm implements AdaptadorLlm {
  readonly llamadas: LlamadaAdaptadorFalso[] = [];
  private readonly pasosPorModelo = new Map<string, PasoAdaptadorFalso[]>();

  constructor(private readonly clock: ClockFalso) {}

  programar(modelo: string, ...pasos: PasoAdaptadorFalso[]): void {
    this.pasosPorModelo.set(modelo, [...(this.pasosPorModelo.get(modelo) ?? []), ...pasos]);
  }

  generarConModelo(
    modelo: string,
    solicitud: SolicitudGeneracion,
    limite: LimiteIntento,
  ): Promise<ResultadoAdaptador> {
    this.llamadas.push({ modelo, solicitud, limite });
    const paso = this.pasosPorModelo.get(modelo)?.shift();
    if (paso === undefined) {
      return Promise.reject(new Error(`FakeAdaptadorLlm: no hay pasos programados para ${modelo}`));
    }
    if ('colgar' in paso) {
      return new Promise<ResultadoAdaptador>(() => undefined);
    }
    if (paso.tardaMs !== undefined) {
      this.clock.avanzar(paso.tardaMs);
    }
    return 'error' in paso ? Promise.reject(paso.error) : Promise.resolve(paso.resultado);
  }
}
