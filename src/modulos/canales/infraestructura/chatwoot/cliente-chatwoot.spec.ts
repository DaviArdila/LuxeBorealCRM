import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Configuracion } from '../../../../plataforma/config/index.js';
import { FalloCanal } from '../../puertos/adaptador-canal.js';
import { ClienteChatwoot } from './cliente-chatwoot.js';
import { CONFIGURACION_AGENTE_DE_PRUEBA } from '../../../../../test/soporte/configuracion-agente-de-prueba.js';
import { CONFIGURACION_LLM_DE_PRUEBA } from '../../../../../test/soporte/configuracion-llm-de-prueba.js';

function configuracionDePrueba(parcial: Partial<Configuracion> = {}): Configuracion {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgresql://localhost:5432/x',
    REDIS_URL: 'redis://localhost:6379',
    HEALTH_TIMEOUT_MS: 1500,
    DOCS_HABILITADO: false,
    MINIO_ENDPOINT: 'localhost',
    MINIO_PUERTO: 9000,
    MINIO_SSL: false,
    MINIO_ACCESS_KEY: 'luxe',
    MINIO_SECRET_KEY: 'luxeclave',
    MINIO_BUCKET: 'luxeboreal-medios',
    MINIO_URL_PUBLICA: undefined,
    CATALOGO_SHEET_ID: undefined,
    CHATWOOT_URL: 'http://chatwoot.local',
    CHATWOOT_ACCOUNT_ID: 7,
    CHATWOOT_BOT_TOKEN: 'token-secreto-de-prueba',
    CHATWOOT_API_TOKEN_LECTURA: '',
    CHATWOOT_WEBHOOK_SECRETO: '',
    CHATWOOT_WEBHOOK_TOLERANCIA_S: 300,
    CHATWOOT_HTTP_TIMEOUT_MS: 5000,
    COLAS_PREFIJO: 'luxe:colas',
    COLAS_TRABAJADORES: false,
    INBOX_MAX_INTENTOS: 5,
    INBOX_BARRIDO_MS: 30000,
    OUTBOX_MAX_INTENTOS: 5,
    OUTBOX_BACKOFF_BASE_S: 15,
    OUTBOX_BACKOFF_MAX_S: 300,
    OUTBOX_BARRIDO_MS: 5000,
    OUTBOX_LEASE_S: 60,
    HUMANO_TTL_HORAS: 3,
    HANDOFF_TTL_MIN: 45,
    LOCK_TURNO_TTL_S: 30,
    RATE_LIMIT_POR_HORA: 20,
    RATE_LIMIT_POR_DIA: 60,
    DEBOUNCE_MS: 3000,
    CONVERSACIONES_CONCURRENCIA: 10,
    CONVERSACIONES_BARRIDO_MS: 300000,
    HANDOFF_ESPERA_MIN: 30,
    ...CONFIGURACION_AGENTE_DE_PRUEBA,
    ...CONFIGURACION_LLM_DE_PRUEBA,
    ...parcial,
  };
}

/** Respuesta mínima compatible con la forma de `Response` que el cliente consume. */
function respuestaFalsa(status: number, cuerpo: unknown = {}, cabeceras: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(cabeceras),
    json: () => Promise.resolve(cuerpo),
  } as unknown as Response;
}

describe('ClienteChatwoot (unitario, D12)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('construye la URL con la cuenta y la conversación, y manda el header api_access_token', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respuestaFalsa(200, { id: 1 }));
    vi.stubGlobal('fetch', fetchFalso);
    const cliente = new ClienteChatwoot(configuracionDePrueba());

    await cliente.post('42', 'messages', { message_type: 'outgoing' });

    expect(fetchFalso).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://chatwoot.local/api/v1/accounts/7/conversations/42/messages');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).api_access_token).toBe('token-secreto-de-prueba');
  });

  describe('credencial por operación (CAN6, token de lectura)', () => {
    function tokenDe(fetchFalso: ReturnType<typeof vi.fn>): string {
      const [, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
      return (init.headers as Record<string, string>).api_access_token ?? '';
    }

    it('la lectura usa CHATWOOT_API_TOKEN_LECTURA y las escrituras siguen con el token del bot', async () => {
      const fetchFalso = vi.fn().mockResolvedValue(respuestaFalsa(200, { payload: [] }));
      vi.stubGlobal('fetch', fetchFalso);
      const cliente = new ClienteChatwoot(configuracionDePrueba({ CHATWOOT_API_TOKEN_LECTURA: 'token-de-usuario' }));

      await cliente.get('42', 'messages', 'lectura');
      await cliente.get('42', 'labels');
      await cliente.post('42', 'messages', {});
      await cliente.postMultipart('42', 'messages', new FormData());

      const tokens = fetchFalso.mock.calls.map(
        ([, init]) => (init as RequestInit & { headers: Record<string, string> }).headers.api_access_token,
      );
      expect(tokens).toEqual(['token-de-usuario', 'token-secreto-de-prueba', 'token-secreto-de-prueba', 'token-secreto-de-prueba']);
    });

    it('sin token de lectura, la lectura cae al token del bot (compatibilidad)', async () => {
      const fetchFalso = vi.fn().mockResolvedValue(respuestaFalsa(200, { payload: [] }));
      vi.stubGlobal('fetch', fetchFalso);
      const cliente = new ClienteChatwoot(configuracionDePrueba({ CHATWOOT_API_TOKEN_LECTURA: '' }));

      await cliente.get('42', 'messages', 'lectura');

      expect(tokenDe(fetchFalso)).toBe('token-secreto-de-prueba');
    });

    it('sin token de lectura, avisa una sola vez al crearse y sin ningún valor de token', () => {
      const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      try {
        new ClienteChatwoot(configuracionDePrueba({ NODE_ENV: 'development', CHATWOOT_API_TOKEN_LECTURA: '' }));

        expect(aviso).toHaveBeenCalledTimes(1);
        const mensaje = String(aviso.mock.calls[0]?.[0]);
        expect(mensaje).toContain('CHATWOOT_API_TOKEN_LECTURA');
        expect(mensaje).toContain('401');
        expect(mensaje).not.toContain('token-secreto-de-prueba');
      } finally {
        aviso.mockRestore();
      }
    });

    it('con token de lectura no avisa, y un fallo de lectura no filtra ningún token', async () => {
      const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuestaFalsa(401, { error: 'x' })));
      try {
        const cliente = new ClienteChatwoot(
          configuracionDePrueba({ NODE_ENV: 'development', CHATWOOT_API_TOKEN_LECTURA: 'token-de-usuario' }),
        );

        const fallo = (await cliente.get('42', 'messages', 'lectura').catch((error: unknown) => error)) as FalloCanal;

        expect(aviso).not.toHaveBeenCalled();
        expect(fallo.naturaleza).toBe('permanente');
        expect(fallo.message).not.toContain('token-de-usuario');
        expect(fallo.message).not.toContain('token-secreto-de-prueba');
      } finally {
        aviso.mockRestore();
      }
    });
  });

  it('un 429 clasifica como transitorio y traduce Retry-After a esperaSugeridaS', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(respuestaFalsa(429, { message: 'rate limited' }, { 'retry-after': '12' })),
    );
    const cliente = new ClienteChatwoot(configuracionDePrueba());

    const fallo = await cliente.post('42', 'messages', {}).catch((error: unknown) => error);

    expect(fallo).toBeInstanceOf(FalloCanal);
    expect((fallo as FalloCanal).naturaleza).toBe('transitorio');
    expect((fallo as FalloCanal).esperaSugeridaS).toBe(12);
  });

  it('un 500 clasifica como transitorio sin esperaSugeridaS', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuestaFalsa(500, { error: 'boom' })));
    const cliente = new ClienteChatwoot(configuracionDePrueba());

    const fallo = await cliente.post('42', 'messages', {}).catch((error: unknown) => error);

    expect(fallo).toBeInstanceOf(FalloCanal);
    expect((fallo as FalloCanal).naturaleza).toBe('transitorio');
    expect((fallo as FalloCanal).esperaSugeridaS).toBeUndefined();
  });

  it('un 404 clasifica como permanente', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuestaFalsa(404, { error: 'not found' })));
    const cliente = new ClienteChatwoot(configuracionDePrueba());

    const fallo = await cliente.post('42', 'messages', {}).catch((error: unknown) => error);

    expect(fallo).toBeInstanceOf(FalloCanal);
    expect((fallo as FalloCanal).naturaleza).toBe('permanente');
  });

  it('un error de red (o timeout) clasifica como transitorio', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')));
    const cliente = new ClienteChatwoot(configuracionDePrueba());

    const fallo = await cliente.post('42', 'messages', {}).catch((error: unknown) => error);

    expect(fallo).toBeInstanceOf(FalloCanal);
    expect((fallo as FalloCanal).naturaleza).toBe('transitorio');
  });

  it('el mensaje de un fallo nunca contiene el token ni el cuerpo de la respuesta (matriz de amenazas)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(respuestaFalsa(500, { secreto_del_cliente: 'no debe aparecer' })),
    );
    const cliente = new ClienteChatwoot(configuracionDePrueba());

    const fallo = (await cliente.post('42', 'messages', {}).catch((error: unknown) => error)) as FalloCanal;

    expect(fallo.message).not.toContain('token-secreto-de-prueba');
    expect(fallo.message).not.toContain('secreto_del_cliente');
    expect(fallo.message).not.toContain('no debe aparecer');
  });

  it('respeta el timeout configurado al armar la señal de abort', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respuestaFalsa(200));
    vi.stubGlobal('fetch', fetchFalso);
    const cliente = new ClienteChatwoot(configuracionDePrueba({ CHATWOOT_HTTP_TIMEOUT_MS: 1234 }));

    await cliente.get('42', 'labels');

    const [, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
