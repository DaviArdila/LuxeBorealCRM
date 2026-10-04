import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AdaptadorCanalChatwoot } from '../../../src/modulos/canales/infraestructura/chatwoot/adaptador-canal-chatwoot.js';
import { ClienteChatwoot } from '../../../src/modulos/canales/infraestructura/chatwoot/cliente-chatwoot.js';
import { LectorMensajeCanalChatwoot } from '../../../src/modulos/canales/infraestructura/chatwoot/lector-mensaje-canal-chatwoot.js';
import { cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { ChatwootFalso } from '../../soporte/chatwoot-falso.js';

const TOKEN_BOT = 'token-del-agent-bot-de-prueba';
const TOKEN_LECTURA = 'token-de-usuario-agente-de-prueba';
const ID_CONVERSACION = '42';

function clienteCon(chatwootFalso: ChatwootFalso, variables: Record<string, string>): ClienteChatwoot {
  return new ClienteChatwoot(
    cargarConfiguracion({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost:5432/x',
      REDIS_URL: 'redis://localhost:6379',
      CHATWOOT_URL: chatwootFalso.url(),
      CHATWOOT_BOT_TOKEN: TOKEN_BOT,
      CHATWOOT_HTTP_TIMEOUT_MS: '2000',
      ...variables,
    }),
  );
}

/**
 * Un Chatwoot real responde 401 a un token de Agent Bot en `GET .../messages`; el servidor falso
 * reproduce esa autorización (`exigirTokensReales`). Bug verificado contra Chatwoot v4.17.1.
 */
describe('Lectura de mensajes con token de usuario (CAN6, integración contra un Chatwoot que autoriza como el real)', () => {
  const chatwootFalso = new ChatwootFalso();

  beforeAll(async () => {
    await chatwootFalso.iniciar();
  });

  afterEach(() => {
    chatwootFalso.limpiar();
  });

  afterAll(async () => {
    await chatwootFalso.detener();
  });

  it('CAN6 — El lector lee el texto del mensaje con el token de usuario y no con el del bot', async () => {
    chatwootFalso.exigirTokensReales({ bot: TOKEN_BOT, lectura: TOKEN_LECTURA });
    chatwootFalso.programarTextoDeMensaje(ID_CONVERSACION, 7, 'hola, busco una grifería');
    const lector = new LectorMensajeCanalChatwoot(clienteCon(chatwootFalso, { CHATWOOT_API_TOKEN_LECTURA: TOKEN_LECTURA }));

    const texto = await lector.obtenerTexto(ID_CONVERSACION, '7');

    expect(texto).toBe('hola, busco una grifería');
    expect(chatwootFalso.llamadasRegistradas().map((l) => l.apiAccessToken)).toEqual([TOKEN_LECTURA]);
  });

  it('CAN6 — Sin token de lectura el lector cae al del bot y Chatwoot lo rechaza: texto null, sin lanzar', async () => {
    chatwootFalso.exigirTokensReales({ bot: TOKEN_BOT, lectura: TOKEN_LECTURA });
    chatwootFalso.programarTextoDeMensaje(ID_CONVERSACION, 7, 'hola');
    const lector = new LectorMensajeCanalChatwoot(clienteCon(chatwootFalso, {}));

    await expect(lector.obtenerTexto(ID_CONVERSACION, '7')).resolves.toBeNull();
    expect(chatwootFalso.llamadasRegistradas().map((l) => l.apiAccessToken)).toEqual([TOKEN_BOT]);
  });

  it('CAN6 — Las salidas del bot siguen con el token del bot aunque exista el de lectura', async () => {
    chatwootFalso.exigirTokensReales({ bot: TOKEN_BOT, lectura: TOKEN_LECTURA });
    const adaptador = new AdaptadorCanalChatwoot(clienteCon(chatwootFalso, { CHATWOOT_API_TOKEN_LECTURA: TOKEN_LECTURA }));

    await adaptador.enviarTexto(ID_CONVERSACION, 'hola', 'canal:mensaje:42:r1:00');
    await adaptador.cambiarEstado(ID_CONVERSACION, 'pendiente');
    await adaptador.agregarEtiquetas(ID_CONVERSACION, ['bot']);

    const llamadas = chatwootFalso.llamadasRegistradas();
    expect(llamadas.map((l) => `${l.metodo} ${l.ruta.split('/').pop()}`)).toEqual([
      'POST messages',
      'POST toggle_status',
      'GET labels',
      'POST labels',
    ]);
    expect(new Set(llamadas.map((l) => l.apiAccessToken))).toEqual(new Set([TOKEN_BOT]));
  });

  it('CAN6 — La reconciliación por marca también lee los mensajes con el token de usuario', async () => {
    chatwootFalso.exigirTokensReales({ bot: TOKEN_BOT, lectura: TOKEN_LECTURA });
    chatwootFalso.programarMensajeExistente(ID_CONVERSACION, 'canal:mensaje:42:r1:00');
    const adaptador = new AdaptadorCanalChatwoot(clienteCon(chatwootFalso, { CHATWOOT_API_TOKEN_LECTURA: TOKEN_LECTURA }));

    await expect(adaptador.existeMensajeConMarca(ID_CONVERSACION, 'canal:mensaje:42:r1:00')).resolves.toBe(true);
  });
});
