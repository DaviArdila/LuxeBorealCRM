import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Configuracion } from '../../../../plataforma/config/index.js';
import { FalloCanal } from '../../puertos/adaptador-canal.js';
import { ClienteChatwoot } from './cliente-chatwoot.js';

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
    CHATWOOT_WEBHOOK_SECRETO: '',
    CHATWOOT_WEBHOOK_TOLERANCIA_S: 300,
    CHATWOOT_HTTP_TIMEOUT_MS: 5000,
    COLAS_PREFIJO: 'luxe:colas',
    COLAS_TRABAJADORES: false,
    INBOX_MAX_INTENTOS: 5,
    INBOX_BARRIDO_MS: 30000,
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
