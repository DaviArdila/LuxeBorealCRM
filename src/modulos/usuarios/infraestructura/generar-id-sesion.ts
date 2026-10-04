import { randomBytes } from 'node:crypto';

/** USR3 (D1): 256 bits de un generador criptográfico, en base64url sin relleno (43 caracteres). */
export function generarIdSesion(): string {
  return randomBytes(32).toString('base64url');
}
