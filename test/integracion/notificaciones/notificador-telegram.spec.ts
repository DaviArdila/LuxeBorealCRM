import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FalloNotificacion } from '../../../src/modulos/notificaciones/puertos/notificador.js';
import { NotificadorTelegram } from '../../../src/modulos/notificaciones/infraestructura/notificador-telegram.js';
import type { Configuracion } from '../../../src/plataforma/config/index.js';
import { TelegramFalso } from '../../soporte/telegram-falso.js';

const TOKEN = 'token-secreto-de-prueba';

describe('NotificadorTelegram contra Telegram falso (NTF1, NTF4)', () => {
  const telegram = new TelegramFalso();

  function crear(sobrescribir: Partial<Configuracion> = {}): NotificadorTelegram {
    return new NotificadorTelegram({
      TELEGRAM_BOT_TOKEN: TOKEN,
      TELEGRAM_CHAT_ID: '-100777',
      TELEGRAM_API_URL: telegram.url(),
      TELEGRAM_HTTP_TIMEOUT_MS: 1000,
      ...sobrescribir,
    } as Configuracion);
  }

  async function fallo(promesa: Promise<void>): Promise<FalloNotificacion> {
    try {
      await promesa;
    } catch (error) {
      if (error instanceof FalloNotificacion) return error;
      throw error;
    }
    throw new Error('se esperaba un FalloNotificacion');
  }

  beforeAll(() => telegram.iniciar());
  afterAll(() => telegram.detener());
  beforeEach(() => telegram.limpiar());

  it('NTF1 — entrega el texto con sendMessage al chat configurado', async () => {
    await crear().enviar('Lead caliente');

    expect(telegram.llamadasRegistradas()).toEqual([
      { ruta: '/bot<token>/sendMessage', chatId: '-100777', texto: 'Lead caliente' },
    ]);
  });

  it('NTF4 — un 500 es transitorio', async () => {
    telegram.programarRespuesta({ status: 500 });

    const error = await fallo(crear().enviar('x'));

    expect(error.naturaleza).toBe('transitorio');
  });

  it('NTF4 — un 429 es transitorio y respeta retry_after', async () => {
    telegram.programarRespuesta({ status: 429, cuerpo: { ok: false, parameters: { retry_after: 7 } } });

    const error = await fallo(crear().enviar('x'));

    expect(error.naturaleza).toBe('transitorio');
    expect(error.esperaSugeridaS).toBe(7);
  });

  it('NTF4 — un 401 es permanente y el error no lleva el token', async () => {
    telegram.programarRespuesta({ status: 401, cuerpo: { ok: false, description: 'Unauthorized' } });

    const error = await fallo(crear().enviar('x'));

    expect(error.naturaleza).toBe('permanente');
    expect(error.causa).not.toContain(TOKEN);
    expect(error.message).not.toContain(TOKEN);
  });

  it('NTF4 — un 400 es permanente', async () => {
    telegram.programarRespuesta({ status: 400 });

    expect((await fallo(crear().enviar('x'))).naturaleza).toBe('permanente');
  });

  it('NTF4 — un servidor caído es transitorio', async () => {
    const error = await fallo(crear({ TELEGRAM_API_URL: 'http://127.0.0.1:1' }).enviar('x'));

    expect(error.naturaleza).toBe('transitorio');
    expect(error.causa).not.toContain(TOKEN);
  });

  it('NTF4 — sin credenciales descarta el aviso sin llamar a Telegram', async () => {
    await crear({ TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '' }).enviar('x');

    expect(telegram.llamadasRegistradas()).toEqual([]);
  });
});
