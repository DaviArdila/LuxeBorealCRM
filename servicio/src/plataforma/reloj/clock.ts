/**
 * Puerto de tiempo (PLT2). La lógica de negocio y de aplicación MUST NOT llamar a `Date.now()` ni
 * a `new Date()` sin argumentos fuera de `plataforma/reloj`; en su lugar, inyecta este puerto por
 * el token {@link CLOCK} y llama {@link Clock.ahora}.
 */
export interface Clock {
  ahora(): Date;
}

/** Token de inyección del puerto {@link Clock} (PLT2). */
export const CLOCK = Symbol('CLOCK');
