export const HASHEADOR_CONTRASENA = Symbol('HASHEADOR_CONTRASENA');

/** Hash de contraseñas con argon2id (USR1, USR10, D6). */
export interface HasheadorContrasena {
  hashear(contrasena: string): Promise<string>;
  /** Un hash malformado cuenta como contraseña incorrecta. */
  verificar(hash: string, contrasena: string): Promise<boolean>;
  /** Verifica contra un hash ficticio y descarta el resultado, para igualar el tiempo de un correo inexistente. */
  verificarFicticio(contrasena: string): Promise<void>;
}
