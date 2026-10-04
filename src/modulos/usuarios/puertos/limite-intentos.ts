export const LIMITE_INTENTOS = Symbol('LIMITE_INTENTOS');

export type ResultadoIntento =
  | { readonly permitido: true }
  | { readonly permitido: false; readonly reintentarEnS: number };

/**
 * Límite de inicios de sesión por correo e IP (USR8, D5). `consumirIntento` cuenta el intento **antes** de verificar
 * la contraseña, en una sola operación atómica: así varios intentos simultáneos no pasan todos la consulta antes de
 * que alguno cuente (hallazgo de la review RDD). Un éxito llama a `reiniciar`, de modo que el contador refleja los
 * fallos.
 */
export interface LimiteIntentos {
  consumirIntento(email: string, ip: string): Promise<ResultadoIntento>;
  reiniciar(email: string, ip: string): Promise<void>;
}
