import type { LlmPort, MensajeLlm, RespuestaGeneracion, SolicitudGeneracion } from '../../../src/modulos/llm/index.js';
import type { GrabacionTurno } from './aserciones.js';

/**
 * Envuelve el `LlmPort` efectivo (guionado o real) y deja a la vista lo que pasó en el turno (D2): las
 * llamadas a herramientas que pidió el modelo y los resultados que el bucle le devolvió. Como registra
 * lo mismo en los dos modos, las aserciones no dependen del modo. `usar` cambia el puerto interno entre
 * casos sin recomponer la aplicación.
 */
export class GrabadorLlm implements LlmPort {
  private llamadasAlLlmContadas = 0;
  private resultadosDelTurno: ResultadoGrabado[] = [];
  private respuestas: RespuestaGeneracion[] = [];

  constructor(private interno: LlmPort) {}

  usar(interno: LlmPort): void {
    this.interno = interno;
  }

  reiniciar(): void {
    this.llamadasAlLlmContadas = 0;
    this.resultadosDelTurno = [];
    this.respuestas = [];
  }

  async generar(solicitud: SolicitudGeneracion): Promise<RespuestaGeneracion> {
    this.llamadasAlLlmContadas += 1;
    // El bucle reutiliza el mismo array de mensajes en todas las vueltas: los resultados nuevos se
    // copian ahora, antes de que la siguiente vuelta le agregue más mensajes.
    this.resultadosDelTurno.push(...resultadosNuevos(solicitud.mensajes));
    const respuesta = await this.interno.generar(solicitud);
    this.respuestas.push(respuesta);
    return respuesta;
  }

  /** Cuántas veces se llamó al LLM desde el último `reiniciar`. */
  get llamadasAlLlm(): number {
    return this.llamadasAlLlmContadas;
  }

  /** Arma la grabación del turno con el texto y el handoff de la respuesta del agente. */
  grabacion(textoFinal: string, handoff: GrabacionTurno['handoff']): GrabacionTurno {
    const nombres = new Map<string, string>();
    const llamadas: { nombre: string; argumentos: unknown }[] = [];
    for (const respuesta of this.respuestas) {
      for (const llamada of respuesta.llamadasHerramienta ?? []) {
        nombres.set(llamada.id, llamada.nombre);
        llamadas.push({ nombre: llamada.nombre, argumentos: llamada.argumentos });
      }
    }
    return { llamadas, resultados: [...this.resultadosDelTurno], textoFinal, handoff };
  }
}

type ResultadoGrabado = GrabacionTurno['resultados'][number];

function resultadosNuevos(mensajes: readonly MensajeLlm[]): ResultadoGrabado[] {
  const ultimo = mensajes.at(-1);
  return (ultimo?.resultadosHerramienta ?? []).map((resultado) => ({
    nombre: resultado.nombre,
    resultado: resultado.resultado,
    esError: resultado.esError,
  }));
}
