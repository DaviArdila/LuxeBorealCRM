import type { HasheadorContrasena } from '../../src/modulos/usuarios/puertos/hasheador-contrasena.js';

/** Doble de test de {@link HasheadorContrasena}: hash legible y registro de cada verificación. */
export class HasheadorContrasenaFalso implements HasheadorContrasena {
  readonly verificaciones: string[] = [];
  readonly verificacionesFicticias: string[] = [];

  hashear(contrasena: string): Promise<string> {
    return Promise.resolve(`hash:${contrasena}`);
  }

  verificar(hash: string, contrasena: string): Promise<boolean> {
    this.verificaciones.push(contrasena);
    return Promise.resolve(hash === `hash:${contrasena}`);
  }

  verificarFicticio(contrasena: string): Promise<void> {
    this.verificacionesFicticias.push(contrasena);
    return Promise.resolve();
  }
}
