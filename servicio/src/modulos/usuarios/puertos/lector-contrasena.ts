/**
 * Pide la contraseña en la consola (USR10, D7). La implementación real vive en `scripts/` (`node:readline` sin eco);
 * las pruebas usan un lector falso. Nunca se lee de un argumento ni de una variable de entorno.
 */
export interface LectorContrasena {
  /** `false` sin una terminal interactiva: el comando no debe ni intentar leer. */
  esInteractivo(): boolean;
  leer(pregunta: string): Promise<string>;
}
