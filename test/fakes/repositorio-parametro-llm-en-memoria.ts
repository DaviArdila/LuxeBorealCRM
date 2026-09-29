import type {
  EstadoTecho,
  RepositorioParametroLlm,
} from '../../src/modulos/llm/puertos/repositorio-parametro-llm.js';

/** Doble de test de {@link RepositorioParametroLlm}: estado del techo y contadores de lectura a la vista. */
export class RepositorioParametroLlmEnMemoria implements RepositorioParametroLlm {
  estado: EstadoTecho | null = null;
  readonly guardados: EstadoTecho[] = [];
  lecturasDeEstado = 0;
  lecturasDeMensaje = 0;
  mensajeTechoGasto = 'Estamos con alta demanda en este momento. Te derivo con un asesor.';

  obtenerMensajeTechoGasto(): Promise<string> {
    this.lecturasDeMensaje += 1;
    return Promise.resolve(this.mensajeTechoGasto);
  }

  leerEstadoTecho(): Promise<EstadoTecho | null> {
    this.lecturasDeEstado += 1;
    return Promise.resolve(this.estado);
  }

  guardarEstadoTecho(estado: EstadoTecho): Promise<void> {
    this.estado = estado;
    this.guardados.push(estado);
    return Promise.resolve();
  }
}
