import { ErrorPasarelaLlm } from '../../../src/modulos/llm/index.js';
import type { FakePuertoLlm, PasoLlmFalso } from '../../fakes/puerto-llm-falso.js';
import type { PasoGuion } from './esquema-caso.js';

/** Traduce un paso del guion a un paso del `FakePuertoLlm`; los ids de llamada son estables por turno (D2). */
function aPasoLlm(paso: PasoGuion, prefijoId: string): PasoLlmFalso {
  if ('texto' in paso) {
    return { respuesta: { texto: paso.texto } };
  }
  if ('llamadas' in paso) {
    return {
      respuesta: {
        llamadasHerramienta: paso.llamadas.map((llamada, i) => ({
          id: `${prefijoId}-${String(i + 1)}`,
          nombre: llamada.nombre,
          argumentos: llamada.argumentos,
        })),
      },
    };
  }
  if ('llamadasInvalidas' in paso) {
    return {
      respuesta: {
        llamadasInvalidas: paso.llamadasInvalidas.map((llamada, i) => ({
          llamada: { id: `${prefijoId}-i${String(i + 1)}`, nombre: llamada.nombre, argumentos: llamada.argumentos },
          causa: llamada.causa,
        })),
      },
    };
  }
  return { error: new ErrorPasarelaLlm(paso.error) };
}

/**
 * Encola el guion de un turno en el LLM falso. Un guion agotado hace fallar al `FakePuertoLlm` con
 * "no hay pasos programados": el bucle lo convierte en un handoff `fallo-llm`, que las aserciones de
 * handoff del caso delatan (un guion corto es un error del caso, no un traspaso legítimo).
 */
export function encolarGuion(llm: FakePuertoLlm, prefijoId: string, guion: readonly PasoGuion[]): void {
  llm.encolar(...guion.map((paso) => aPasoLlm(paso, prefijoId)));
}
