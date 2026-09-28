import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AdaptadorCanalChatwoot } from '../../../src/modulos/canales/infraestructura/chatwoot/adaptador-canal-chatwoot.js';
import { ClienteChatwoot } from '../../../src/modulos/canales/infraestructura/chatwoot/cliente-chatwoot.js';
import { FalloCanal } from '../../../src/modulos/canales/puertos/adaptador-canal.js';
import type { Configuracion } from '../../../src/plataforma/config/index.js';
import { ChatwootFalso } from '../../soporte/chatwoot-falso.js';

const ID_CONVERSACION = '42';

function configuracionDePrueba(chatwootFalso: ChatwootFalso, parcial: Partial<Configuracion> = {}): Configuracion {
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
    CHATWOOT_URL: chatwootFalso.url(),
    CHATWOOT_ACCOUNT_ID: 1,
    CHATWOOT_BOT_TOKEN: 'token-de-prueba-nunca-debe-salir-en-un-error',
    CHATWOOT_WEBHOOK_SECRETO: '',
    CHATWOOT_WEBHOOK_TOLERANCIA_S: 300,
    CHATWOOT_HTTP_TIMEOUT_MS: 300,
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
    ...parcial,
  };
}

describe('AdaptadorCanalChatwoot contra un servidor HTTP real (T5, integración, CAN6/CAN7/D13/D15)', () => {
  const chatwootFalso = new ChatwootFalso();
  let adaptador: AdaptadorCanalChatwoot;

  beforeAll(async () => {
    await chatwootFalso.iniciar();
    const cliente = new ClienteChatwoot(configuracionDePrueba(chatwootFalso));
    adaptador = new AdaptadorCanalChatwoot(cliente);
  });

  afterEach(() => {
    chatwootFalso.limpiar();
  });

  afterAll(async () => {
    await chatwootFalso.detener();
  });

  it('CAN6 — Enviar un mensaje a través del puerto se traduce a la llamada de mensajes de Chatwoot', async () => {
    await adaptador.enviarTexto(ID_CONVERSACION, 'hola, ¿en qué te ayudo?', 'canal:mensaje:42:r1:00');

    const [llamada] = chatwootFalso.llamadasRegistradas();
    expect(llamada.metodo).toBe('POST');
    expect(llamada.ruta).toBe(`/api/v1/accounts/1/conversations/${ID_CONVERSACION}/messages`);
    expect(llamada.apiAccessToken).toBe('token-de-prueba-nunca-debe-salir-en-un-error');
    expect(llamada.cuerpo).toMatchObject({
      content: 'hola, ¿en qué te ayudo?',
      content_attributes: { luxe_clave: 'canal:mensaje:42:r1:00' },
    });
  });

  it('CAN6 — Cambiar el estado de una conversación se traduce a la llamada de toggle_status', async () => {
    await adaptador.cambiarEstado(ID_CONVERSACION, 'resuelta');

    const [llamada] = chatwootFalso.llamadasRegistradas();
    expect(llamada.metodo).toBe('POST');
    expect(llamada.ruta).toBe(`/api/v1/accounts/1/conversations/${ID_CONVERSACION}/toggle_status`);
    expect(llamada.apiAccessToken).toBe('token-de-prueba-nunca-debe-salir-en-un-error');
    expect(llamada.cuerpo).toEqual({ status: 'resolved' });
  });

  it('CAN6 — Etiquetar una conversación se traduce a la llamada de labels', async () => {
    await adaptador.agregarEtiquetas(ID_CONVERSACION, ['vip']);

    const llamadaPost = chatwootFalso.llamadasRegistradas().find((l) => l.metodo === 'POST');
    expect(llamadaPost?.ruta).toBe(`/api/v1/accounts/1/conversations/${ID_CONVERSACION}/labels`);
    expect(llamadaPost?.apiAccessToken).toBe('token-de-prueba-nunca-debe-salir-en-un-error');
    expect(llamadaPost?.cuerpo).toEqual({ labels: ['vip'] });
  });

  it('D15 — agregarEtiquetas une con las etiquetas ya puestas por un asesor, sin reemplazarlas', async () => {
    chatwootFalso.programarEtiquetasExistentes(ID_CONVERSACION, ['puesta-por-asesor']);

    await adaptador.agregarEtiquetas(ID_CONVERSACION, ['nueva-del-bot']);

    const llamadaGet = chatwootFalso.llamadasRegistradas().find((l) => l.metodo === 'GET');
    const llamadaPost = chatwootFalso.llamadasRegistradas().find((l) => l.metodo === 'POST');
    expect(llamadaGet?.ruta).toBe(`/api/v1/accounts/1/conversations/${ID_CONVERSACION}/labels`);
    expect(llamadaPost?.cuerpo).toEqual({ labels: ['puesta-por-asesor', 'nueva-del-bot'] });
  });

  it('D13 — existeMensajeConMarca encuentra un mensaje ya creado por un intento anterior', async () => {
    chatwootFalso.programarMensajeExistente(ID_CONVERSACION, 'canal:mensaje:42:r1:00');

    const existe = await adaptador.existeMensajeConMarca(ID_CONVERSACION, 'canal:mensaje:42:r1:00');

    expect(existe).toBe(true);
  });

  it('D13 — existeMensajeConMarca no encuentra nada cuando no se envió antes ese mensaje', async () => {
    const existe = await adaptador.existeMensajeConMarca(ID_CONVERSACION, 'canal:mensaje:42:r9:00');

    expect(existe).toBe(false);
  });

  it('CAN7 — un 429 con Retry-After clasifica como transitorio con la espera sugerida', async () => {
    chatwootFalso.programarRespuesta({ status: 429, cabeceras: { 'retry-after': '5' } });

    const fallo = await adaptador
      .enviarTexto(ID_CONVERSACION, 'texto', 'clave')
      .catch((error: unknown) => error);

    expect(fallo).toBeInstanceOf(FalloCanal);
    expect((fallo as FalloCanal).naturaleza).toBe('transitorio');
    expect((fallo as FalloCanal).esperaSugeridaS).toBe(5);
  });

  it('CAN7 — un 500 clasifica como transitorio', async () => {
    chatwootFalso.programarRespuesta({ status: 500 });

    const fallo = await adaptador
      .enviarTexto(ID_CONVERSACION, 'texto', 'clave')
      .catch((error: unknown) => error);

    expect(fallo).toBeInstanceOf(FalloCanal);
    expect((fallo as FalloCanal).naturaleza).toBe('transitorio');
  });

  it('CAN7 — un timeout de red clasifica como transitorio', async () => {
    // La configuración de prueba fija CHATWOOT_HTTP_TIMEOUT_MS en 300 ms; el falso responde más tarde.
    chatwootFalso.programarRespuesta({ status: 200, cuerpo: { id: 1 }, retrasoMs: 1000 });

    const fallo = await adaptador
      .enviarTexto(ID_CONVERSACION, 'texto', 'clave')
      .catch((error: unknown) => error);

    expect(fallo).toBeInstanceOf(FalloCanal);
    expect((fallo as FalloCanal).naturaleza).toBe('transitorio');
  }, 10_000);

  it('CAN7 — un 404 (4xx distinto de 429) clasifica como permanente sin reintento', async () => {
    chatwootFalso.programarRespuesta({ status: 404 });

    const fallo = await adaptador
      .enviarTexto(ID_CONVERSACION, 'texto', 'clave')
      .catch((error: unknown) => error);

    expect(fallo).toBeInstanceOf(FalloCanal);
    expect((fallo as FalloCanal).naturaleza).toBe('permanente');
  });

  it('el mensaje de un fallo nunca contiene el token ni el cuerpo de la respuesta (matriz de amenazas)', async () => {
    chatwootFalso.programarRespuesta({ status: 500, cuerpo: { secreto: 'contenido-nunca-visible' } });

    const fallo = (await adaptador
      .enviarTexto(ID_CONVERSACION, 'texto', 'clave')
      .catch((error: unknown) => error)) as FalloCanal;

    expect(fallo.message).not.toContain('token-de-prueba-nunca-debe-salir-en-un-error');
    expect(fallo.message).not.toContain('contenido-nunca-visible');
  });
});
