import { describe, expect, it } from 'vitest';
import { LectorMensajeCanalChatwoot } from './lector-mensaje-canal-chatwoot.js';
import type { ClienteChatwoot } from './cliente-chatwoot.js';

/** Mismo patrón que `ClienteChatwootFalso` de `adaptador-canal-chatwoot.spec.ts`. */
class ClienteChatwootFalso {
  readonly llamadasGet: { idConversacion: string; sufijo: string }[] = [];

  constructor(private readonly respuestaGet: unknown = { payload: [] }) {}

  get(idConversacion: string, sufijo: string): Promise<unknown> {
    this.llamadasGet.push({ idConversacion, sufijo });
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
    expect(cliente.llamadasGet).toEqual([{ idConversacion: '42', sufijo: 'messages' }]);
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
});
