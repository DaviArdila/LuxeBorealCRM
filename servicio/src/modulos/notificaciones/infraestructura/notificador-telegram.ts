import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIGURACION } from '../../../plataforma/config/index.js';
import type { Configuracion } from '../../../plataforma/config/index.js';
import { FalloNotificacion, type Notificador } from '../puertos/notificador.js';

/**
 * Adaptador de {@link Notificador} sobre la Bot API de Telegram (D9 de la Fase 08): `fetch` nativo con
 * timeout y **cero reintentos propios** — el reintento es del outbox (ADR-0004). La URL lleva el token del
 * bot, así que ningún mensaje de error ni log la incluye. Sin token o sin chat (desarrollo) descarta el
 * aviso con un `warn` en vez de romper la derivación (NTF4); `production` no arranca sin ambos.
 */
@Injectable()
export class NotificadorTelegram implements Notificador {
  private readonly logger = new Logger(NotificadorTelegram.name);

  constructor(@Inject(CONFIGURACION) private readonly configuracion: Configuracion) {}

  async enviar(texto: string): Promise<void> {
    const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId } = this.configuracion;
    if (token === '' || chatId === '') {
      this.logger.warn({ evento: 'notificaciones.telegram-desactivado' });
      return;
    }

    const base = this.configuracion.TELEGRAM_API_URL.replace(/\/+$/, '');
    let respuesta: Response;
    try {
      respuesta = await fetch(`${base}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: texto, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(this.configuracion.TELEGRAM_HTTP_TIMEOUT_MS),
      });
    } catch {
      // Red o timeout: transitorio. La causa cruda del error de fetch puede traer la URL (con el token).
      throw new FalloNotificacion('transitorio', 'sendMessage: sin respuesta');
    }

    if (respuesta.ok) {
      return;
    }
    if (respuesta.status === 429) {
      throw new FalloNotificacion('transitorio', 'sendMessage: 429', await esperaSugerida(respuesta));
    }
    if (respuesta.status >= 500) {
      throw new FalloNotificacion('transitorio', `sendMessage: ${respuesta.status}`);
    }
    throw new FalloNotificacion('permanente', `sendMessage: ${respuesta.status}`);
  }
}

/** `retry_after` (segundos) viene en el cuerpo de un 429 de Telegram, o en la cabecera `Retry-After`. */
async function esperaSugerida(respuesta: Response): Promise<number | undefined> {
  const cabecera = Number(respuesta.headers.get('retry-after'));
  if (Number.isFinite(cabecera) && cabecera > 0) {
    return cabecera;
  }
  const cuerpo = (await respuesta.json().catch(() => undefined)) as
    | { parameters?: { retry_after?: unknown } }
    | undefined;
  const valor = cuerpo?.parameters?.retry_after;
  return typeof valor === 'number' && valor >= 0 ? valor : undefined;
}
