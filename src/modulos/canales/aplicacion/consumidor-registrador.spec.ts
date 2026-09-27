import { describe, expect, it, vi } from 'vitest';
import type { EventoCanal } from '../dominio/evento-canal.js';
import { ConsumidorRegistrador } from './consumidor-registrador.js';

function eventoDePrueba(): EventoCanal {
  return {
    v: 1,
    eventoProveedor: 'message_created',
    conversacion: {
      idExterno: '42',
      idContactoExterno: null,
      canal: 'whatsapp',
      canalProveedor: 'Channel::Whatsapp',
    },
    tipo: 'mensaje-entrante',
    idMensaje: 'msj-1',
    tipoContenido: 'texto',
  };
}

describe('ConsumidorRegistrador (T4, D8)', () => {
  it('registra el evento en el log sin lanzar', async () => {
    const consumidor = new ConsumidorRegistrador();

    await expect(consumidor.consumir(eventoDePrueba())).resolves.toBeUndefined();
  });

  it('el log no incluye ningún campo de contenido (R14): solo tipo, conversación y canal', async () => {
    const consumidor = new ConsumidorRegistrador();
    const logger = (consumidor as unknown as { readonly logger: { log: (msg: string) => void } }).logger;
    const espia = vi.spyOn(logger, 'log');

    await consumidor.consumir(eventoDePrueba());

    expect(espia).toHaveBeenCalledTimes(1);
    const mensaje = espia.mock.calls[0]?.[0] ?? '';
    expect(mensaje).toContain('mensaje-entrante');
    expect(mensaje).toContain('42');
    expect(mensaje).toContain('whatsapp');
  });
});
