import type { Configuracion } from '../../src/plataforma/config/index.js';

type CamposAuth = Extract<keyof Configuracion, `SESION_${string}` | `AUTH_${string}`>;

// Igual que `CONFIGURACION_LLM_DE_PRUEBA`: los tests que arman una `Configuracion` completa a mano
// expanden este bloque en vez de repetir las variables de sesión (T2 de la Fase 11a).
export const CONFIGURACION_AUTH_DE_PRUEBA: Pick<Configuracion, CamposAuth> = {
  SESION_INACTIVIDAD_MIN: 720,
  SESION_DURACION_MAX_H: 168,
  AUTH_INTENTOS_MAX: 5,
  AUTH_VENTANA_MIN: 15,
};
