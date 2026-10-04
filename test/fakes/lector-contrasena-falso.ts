import type { LectorContrasena } from '../../src/modulos/usuarios/puertos/lector-contrasena.js';

/** Doble de test de {@link LectorContrasena}: entrega las respuestas en orden y cuenta cuántas veces se le pidió. */
export class LectorContrasenaFalso implements LectorContrasena {
  lecturas = 0;
  private readonly respuestas: string[];

  constructor(
    respuestas: readonly string[],
    private readonly interactivo = true,
  ) {
    this.respuestas = [...respuestas];
  }

  esInteractivo(): boolean {
    return this.interactivo;
  }

  leer(): Promise<string> {
    this.lecturas += 1;
    const respuesta = this.respuestas.shift();
    if (respuesta === undefined) return Promise.reject(new Error('el lector falso se quedó sin respuestas'));
    return Promise.resolve(respuesta);
  }
}
