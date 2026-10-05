import { describe, expect, it } from 'vitest';
import { FalloPublicacion, type EntradaOutbox } from '../../../plataforma/outbox/index.js';
import { FalloNotificacion, type Notificador } from '../puertos/notificador.js';
import { PublicarNotificacionTelegram } from './publicar-notificacion-telegram.js';

function entrada(efimero: Record<string, unknown> | null = { texto: 'Lead caliente' }): EntradaOutbox {
  return {
    id: 'o1',
    tipo: 'notificacion.telegram',
    claveIdempotencia: 'aviso:l1',
    grupo: 'lead:l1',
    orden: 0,
    datos: {},
    ...(efimero === null ? {} : { efimero }),
    intento: 1,
  };
}

class NotificadorFalso implements Notificador {
  readonly enviados: string[] = [];
  constructor(private readonly fallo?: Error) {}
  enviar(texto: string): Promise<void> {
    if (this.fallo) return Promise.reject(this.fallo);
    this.enviados.push(texto);
    return Promise.resolve();
  }
}

describe('PublicarNotificacionTelegram', () => {
  it('NTF1 — entrega el texto efímero de la fila al notificador', async () => {
    const notificador = new NotificadorFalso();

    await new PublicarNotificacionTelegram(notificador).publicar(entrada());

    expect(notificador.enviados).toEqual(['Lead caliente']);
  });

  it('NTF4 — traduce un fallo transitorio con la espera sugerida', async () => {
    const manejador = new PublicarNotificacionTelegram(
      new NotificadorFalso(new FalloNotificacion('transitorio', 'sendMessage: 429', 9)),
    );

    const error = await manejador.publicar(entrada()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(FalloPublicacion);
    expect(error).toMatchObject({ clase: 'transitorio', causa: 'sendMessage: 429', esperaSugeridaS: 9 });
  });

  it('NTF4 — traduce un fallo permanente', async () => {
    const manejador = new PublicarNotificacionTelegram(
      new NotificadorFalso(new FalloNotificacion('permanente', 'sendMessage: 401')),
    );

    const error = await manejador.publicar(entrada()).catch((e: unknown) => e);

    expect(error).toMatchObject({ clase: 'permanente' });
  });

  it('una fila sin texto es un error de programación: permanente, sin reintentos', async () => {
    const error = await new PublicarNotificacionTelegram(new NotificadorFalso())
      .publicar(entrada(null))
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ clase: 'permanente' });
  });
});
