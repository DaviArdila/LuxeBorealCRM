import type {
  EstadoTecho,
  RepositorioParametroLlm,
} from '../../src/modulos/llm/puertos/repositorio-parametro-llm.js';

/** Doble de test de {@link RepositorioParametroLlm}: estado del techo y contadores de lectura a la vista. */
export class RepositorioParametroLlmEnMemoria implements RepositorioParametroLlm {
  estado: EstadoTecho | null = null;
  readonly guardados: EstadoTecho[] = [];
  lecturasDeEstado = 0;
  // Valor de `llm_techo_mensual_usd` en `parametro`; `null` = no configurado.
  techoMensualUsd: number | null = null;
  fallaElTecho = false;

  obtenerTechoMensualUsd(): Promise<number | null> {
    if (this.fallaElTecho) {
      return Promise.reject(new Error('base no disponible'));
    }
    return Promise.resolve(this.techoMensualUsd);
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
