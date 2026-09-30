import { describe, expect, it } from 'vitest';
import { LectorMensajeCanalChatwoot } from './lector-mensaje-canal-chatwoot.js';
import type { ClienteChatwoot } from './cliente-chatwoot.js';

/** Mismo patrón que `ClienteChatwootFalso` de `adaptador-canal-chatwoot.spec.ts`. */
class ClienteChatwootFalso {
  readonly llamadasGet: { idConversacion: string; sufijo: string; credencial?: string }[] = [];

  constructor(private readonly respuestaGet: unknown = { payload: [] }) {}

  get(idConversacion: string, sufijo: string, credencial?: string): Promise<unknown> {
    this.llamadasGet.push({ idConversacion, sufijo, credencial });
    return Promise.resolve(this.respuestaGet);
  }
}

function lectorCon(cliente: ClienteChatwootFalso): LectorMensajeCanalChatwoot {
  return new LectorMensajeCanalChatwoot(cliente as unknown as ClienteChatwoot);
}

describe('LectorMensajeCanalChatwoot (unitario, D16 de la Fase 05)', () => {
  it('devuelve el content del mensaje cuyo id coincide', async () => {
    const cliente = new ClienteChatwootFalso({
      payload: [
        { id: 1, content: 'hola' },
        { id: 2, content: 'texto del mensaje buscado' },
      ],
    });
    const lector = lectorCon(cliente);

    const texto = await lector.obtenerTexto('42', '2');

    expect(texto).toBe('texto del mensaje buscado');
    // Chatwoot responde 401 a un token de Agent Bot al listar mensajes: se pide la credencial de lectura.
    expect(cliente.llamadasGet).toEqual([{ idConversacion: '42', sufijo: 'messages', credencial: 'lectura' }]);
  });

  it('devuelve null cuando ningún mensaje coincide con el id', async () => {
    const cliente = new ClienteChatwootFalso({ payload: [{ id: 1, content: 'hola' }] });
    const lector = lectorCon(cliente);

    expect(await lector.obtenerTexto('42', '999')).toBeNull();
  });

  it('devuelve null ante una respuesta con forma inesperada, sin lanzar', async () => {
    const cliente = new ClienteChatwootFalso('cualquier-cosa');
    const lector = lectorCon(cliente);

    expect(await lector.obtenerTexto('42', '1')).toBeNull();
  });

  it('devuelve null en vez de lanzar cuando el cliente Chatwoot falla (p. ej. FalloCanal)', async () => {
    class ClienteChatwootQueFalla {
      get(): Promise<unknown> {
        return Promise.reject(new Error('FalloCanal: timeout'));
      }
    }
    const lector = new LectorMensajeCanalChatwoot(new ClienteChatwootQueFalla() as unknown as ClienteChatwoot);

    await expect(lector.obtenerTexto('42', '1')).resolves.toBeNull();
  });
});
