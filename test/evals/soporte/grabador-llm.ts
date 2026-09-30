import type { LlmPort, MensajeLlm, RespuestaGeneracion, SolicitudGeneracion } from '../../../src/modulos/llm/index.js';
import type { GrabacionTurno } from './aserciones.js';

/**
 * Envuelve el `LlmPort` efectivo (guionado o real) y deja a la vista lo que pasó en el turno (D2): las
 * llamadas a herramientas que pidió el modelo y los resultados que el bucle le devolvió. Como registra
 * lo mismo en los dos modos, las aserciones no dependen del modo. `usar` cambia el puerto interno entre
 * casos sin recomponer la aplicación.
 */
export class GrabadorLlm implements LlmPort {
  private solicitudes: SolicitudGeneracion[] = [];
  private respuestas: RespuestaGeneracion[] = [];

  constructor(private interno: LlmPort) {}

  usar(interno: LlmPort): void {
    this.interno = interno;
  }

  reiniciar(): void {
    this.solicitudes = [];
    this.respuestas = [];
  }

  async generar(solicitud: SolicitudGeneracion): Promise<RespuestaGeneracion> {
    this.solicitudes.push(solicitud);
    const respuesta = await this.interno.generar(solicitud);
    this.respuestas.push(respuesta);
    return respuesta;
  }

  /** Cuántas veces se llamó al LLM desde el último `reiniciar`. */
  get llamadasAlLlm(): number {
    return this.solicitudes.length;
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
    // Cada solicitud arrastra el historial del turno: solo su último mensaje trae resultados nuevos.
    const resultados = this.solicitudes.flatMap((solicitud) => resultadosNuevos(solicitud.mensajes));
    return { llamadas, resultados, textoFinal, handoff };
  }
}

function resultadosNuevos(mensajes: readonly MensajeLlm[]): GrabacionTurno['resultados'] {
  const ultimo = mensajes.at(-1);
  return (ultimo?.resultadosHerramienta ?? []).map((resultado) => ({
    nombre: resultado.nombre,
    resultado: resultado.resultado,
    esError: resultado.esError,
  }));
}
