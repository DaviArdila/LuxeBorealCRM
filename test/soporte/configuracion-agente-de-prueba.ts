import type { Configuracion } from '../../src/plataforma/config/index.js';

type CamposAgente = Extract<
  keyof Configuracion,
  `AGENTE_${string}` | `TELEGRAM_${string}` | `LEADS_${string}`
>;

// Igual que `CONFIGURACION_LLM_DE_PRUEBA`: los tests que arman una `Configuracion` completa a mano
// expanden este bloque; una variable `AGENTE_*` nueva se agrega aquí una sola vez (T4 de la Fase 07a).
export const CONFIGURACION_AGENTE_DE_PRUEBA: Pick<Configuracion, CamposAgente> = {
  AGENTE_TOPE_TURNOS: 12,
  AGENTE_SESION_TTL_H: 168,
  AGENTE_MAX_VUELTAS: 5,
  AGENTE_HISTORIAL_TURNOS: 6,
  AGENTE_FOTOS_INDIVIDUALES_MAX: 4,
  // Fase 08 (T6): sin credenciales, el aviso a Telegram queda desactivado en los tests que no lo prueban.
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_CHAT_ID: '',
  TELEGRAM_API_URL: 'http://127.0.0.1:1',
  TELEGRAM_HTTP_TIMEOUT_MS: 1000,
  LEADS_VENTANA_NOTIFICACION_H: 24,
  LEADS_RECORDATORIO_MIN: 30,
  LEADS_BARRIDO_MS: 60000,
};
