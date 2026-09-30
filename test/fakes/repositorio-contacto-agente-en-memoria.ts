import type {
  DatosCapturados,
  RepositorioContactoAgente,
} from '../../src/modulos/agente/puertos/repositorio-contacto-agente.js';

/** Doble de test de {@link RepositorioContactoAgente}: nombres y datos guardados a la vista. */
export class RepositorioContactoAgenteEnMemoria implements RepositorioContactoAgente {
  readonly nombres = new Map<string, string>();
  readonly guardados = new Map<string, DatosCapturados>();

  leerNombre(contactoId: string): Promise<string | null> {
    return Promise.resolve(this.nombres.get(contactoId) ?? null);
  }

  guardarDatosCapturados(contactoId: string, datos: DatosCapturados): Promise<void> {
    this.guardados.set(contactoId, datos);
    return Promise.resolve();
  }
}
