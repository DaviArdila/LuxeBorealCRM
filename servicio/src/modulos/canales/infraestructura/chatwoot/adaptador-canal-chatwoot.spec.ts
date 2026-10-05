import { describe, expect, it } from 'vitest';
import { AdaptadorCanalChatwoot } from './adaptador-canal-chatwoot.js';
import type { ClienteChatwoot } from './cliente-chatwoot.js';

/** Doble de {@link ClienteChatwoot} que registra cada llamada para verificarla (mismo patrón que `RepositorioEventoEntranteFalso`). */
class ClienteChatwootFalso {
  readonly llamadasPost: { idConversacion: string; sufijo: string; cuerpo: Readonly<Record<string, unknown>> }[] = [];
  readonly llamadasMultipart: { idConversacion: string; sufijo: string; formulario: FormData }[] = [];
  readonly llamadasGet: { idConversacion: string; sufijo: string }[] = [];

  constructor(private readonly respuestaGet: unknown = { payload: [] }) {}

  post(idConversacion: string, sufijo: string, cuerpo: Readonly<Record<string, unknown>>): Promise<unknown> {
    this.llamadasPost.push({ idConversacion, sufijo, cuerpo });
    return Promise.resolve({ id: 1 });
  }

  postMultipart(idConversacion: string, sufijo: string, formulario: FormData): Promise<unknown> {
    this.llamadasMultipart.push({ idConversacion, sufijo, formulario });
    return Promise.resolve({ id: 1 });
  }

  get(idConversacion: string, sufijo: string): Promise<unknown> {
    this.llamadasGet.push({ idConversacion, sufijo });
    return Promise.resolve(this.respuestaGet);
  }
}

function adaptadorCon(cliente: ClienteChatwootFalso): AdaptadorCanalChatwoot {
  return new AdaptadorCanalChatwoot(cliente as unknown as ClienteChatwoot);
}

describe('AdaptadorCanalChatwoot (unitario, D9/D12/D13/D15)', () => {
  it('CAN6 — enviarTexto hace POST a messages con la marca de idempotencia en content_attributes', async () => {
    const cliente = new ClienteChatwootFalso();
    const adaptador = adaptadorCon(cliente);

    await adaptador.enviarTexto('42', 'hola', 'canal:mensaje:42:r1:00');

    expect(cliente.llamadasPost).toEqual([
      {
        idConversacion: '42',
        sufijo: 'messages',
        cuerpo: {
          message_type: 'outgoing',
          content: 'hola',
          content_attributes: { luxe_clave: 'canal:mensaje:42:r1:00' },
        },
      },
    ]);
  });

  it('CAN6 — cambiarEstado traduce cada estado propio al status de Chatwoot vía toggle_status', async () => {
    const cliente = new ClienteChatwootFalso();
    const adaptador = adaptadorCon(cliente);

    await adaptador.cambiarEstado('42', 'abierta');
    await adaptador.cambiarEstado('42', 'pendiente');
    await adaptador.cambiarEstado('42', 'resuelta');

    expect(cliente.llamadasPost.map((l) => l.cuerpo)).toEqual([
      { status: 'open' },
      { status: 'pending' },
      { status: 'resolved' },
    ]);
  });

  it('D13 — existeMensajeConMarca encuentra la marca entre los mensajes recientes', async () => {
    const cliente = new ClienteChatwootFalso({
      payload: [
        { id: 1, content_attributes: { luxe_clave: 'otra-clave' } },
        { id: 2, content_attributes: { luxe_clave: 'canal:mensaje:42:r1:00' } },
      ],
    });
    const adaptador = adaptadorCon(cliente);

    const existe = await adaptador.existeMensajeConMarca('42', 'canal:mensaje:42:r1:00');

    expect(existe).toBe(true);
    expect(cliente.llamadasGet).toEqual([{ idConversacion: '42', sufijo: 'messages' }]);
  });

  it('D13 — existeMensajeConMarca devuelve false cuando ningún mensaje trae la marca', async () => {
    const cliente = new ClienteChatwootFalso({ payload: [{ id: 1, content_attributes: null }] });
    const adaptador = adaptadorCon(cliente);

    const existe = await adaptador.existeMensajeConMarca('42', 'canal:mensaje:42:r1:00');

    expect(existe).toBe(false);
  });

  it('D13 — existeMensajeConMarca devuelve false ante una respuesta con forma inesperada, sin lanzar', async () => {
    const cliente = new ClienteChatwootFalso('cualquier-cosa');
    const adaptador = adaptadorCon(cliente);

    const existe = await adaptador.existeMensajeConMarca('42', 'canal:mensaje:42:r1:00');

    expect(existe).toBe(false);
  });

  it('D15 — agregarEtiquetas une las etiquetas existentes con las nuevas, sin reemplazar', async () => {
    const cliente = new ClienteChatwootFalso({ payload: ['vip'] });
    const adaptador = adaptadorCon(cliente);

    await adaptador.agregarEtiquetas('42', ['nueva']);

    expect(cliente.llamadasGet).toEqual([{ idConversacion: '42', sufijo: 'labels' }]);
    expect(cliente.llamadasPost).toEqual([
      { idConversacion: '42', sufijo: 'labels', cuerpo: { labels: ['vip', 'nueva'] } },
    ]);
  });

  it('D15 — agregarEtiquetas no duplica una etiqueta que ya estaba puesta', async () => {
    const cliente = new ClienteChatwootFalso({ payload: ['vip'] });
    const adaptador = adaptadorCon(cliente);

    await adaptador.agregarEtiquetas('42', ['vip', 'nueva']);

    expect(cliente.llamadasPost).toEqual([
      { idConversacion: '42', sufijo: 'labels', cuerpo: { labels: ['vip', 'nueva'] } },
    ]);
  });

  it('CAN6 — enviarImagen hace POST multipart con el adjunto, la leyenda y la marca en el nombre y en content_attributes', async () => {
    const cliente = new ClienteChatwootFalso();
    const adaptador = adaptadorCon(cliente);
    const bytes = Buffer.from('jpeg-de-prueba');

    await adaptador.enviarImagen('42', bytes, 'image/jpeg', 'Modelo Luna', 'canal:mensaje:42:r1:01');

    const [llamada] = cliente.llamadasMultipart;
    expect(llamada?.idConversacion).toBe('42');
    expect(llamada?.sufijo).toBe('messages');
    const formulario = llamada.formulario;
    expect(formulario.get('message_type')).toBe('outgoing');
    expect(formulario.get('content')).toBe('Modelo Luna');
    expect(JSON.parse(formulario.get('content_attributes') as string)).toEqual({ luxe_clave: 'canal:mensaje:42:r1:01' });
    const adjunto = formulario.get('attachments[]') as File;
    expect(adjunto.name).toBe('canal_mensaje_42_r1_01.jpg');
    expect(adjunto.type).toBe('image/jpeg');
    expect(Buffer.from(await adjunto.arrayBuffer())).toEqual(bytes);
  });

  it('CAN6 — enviarImagen sin leyenda no manda content', async () => {
    const cliente = new ClienteChatwootFalso();

    await adaptadorCon(cliente).enviarImagen('42', Buffer.from('x'), 'image/png', undefined, 'canal:mensaje:42:r1:01');

    const formulario = cliente.llamadasMultipart[0].formulario;
    expect(formulario.has('content')).toBe(false);
    expect((formulario.get('attachments[]') as File).name).toBe('canal_mensaje_42_r1_01.png');
  });

  it('CAN10 — existeMensajeConMarca encuentra la marca en el nombre del adjunto cuando content_attributes no vuelve', async () => {
    const cliente = new ClienteChatwootFalso({
      payload: [
        { id: 1, content_attributes: {}, attachments: [{ data_url: 'http://cw/blobs/x/otra.jpg' }] },
        {
          id: 2,
          attachments: [{ data_url: 'http://cw/rails/blobs/x/canal_mensaje_42_r1_01.jpg?disposition=attachment' }],
        },
      ],
    });
    const adaptador = adaptadorCon(cliente);

    expect(await adaptador.existeMensajeConMarca('42', 'canal:mensaje:42:r1:01')).toBe(true);
    expect(await adaptador.existeMensajeConMarca('42', 'canal:mensaje:42:r1:1')).toBe(false);
    expect(await adaptador.existeMensajeConMarca('42', 'canal:mensaje:42:r1:00')).toBe(false);
  });
});
