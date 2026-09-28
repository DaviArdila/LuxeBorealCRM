import { describe, expect, it } from 'vitest';
import type { EntradaOutbox } from '../../../plataforma/outbox/index.js';
import { FalloPublicacion } from '../../../plataforma/outbox/index.js';
import { FalloCanal, type AdaptadorCanal } from '../puertos/adaptador-canal.js';
import { PublicarEfectoCanal } from './publicar-efecto-canal.js';
import { TIPO_OUTBOX_ESTADO, TIPO_OUTBOX_ETIQUETAS, TIPO_OUTBOX_MENSAJE } from './salida-canal-outbox.js';

/** Doble de {@link AdaptadorCanal} que registra cada llamada (mismo patrón que `ClienteChatwootFalso`). */
class AdaptadorCanalFalso implements AdaptadorCanal {
  readonly enviados: { idConversacion: string; texto: string; marca: string }[] = [];
  readonly estadosCambiados: { idConversacion: string; estado: string }[] = [];
  readonly etiquetasAgregadas: { idConversacion: string; etiquetas: readonly string[] }[] = [];
  readonly consultasDeMarca: { idConversacion: string; marca: string }[] = [];

  constructor(
    private readonly existeMarca: boolean = false,
    private readonly falloAEmitir: FalloCanal | undefined = undefined,
  ) {}

  enviarTexto(idConversacion: string, texto: string, marca: string): Promise<void> {
    if (this.falloAEmitir) return Promise.reject(this.falloAEmitir);
    this.enviados.push({ idConversacion, texto, marca });
    return Promise.resolve();
  }

  existeMensajeConMarca(idConversacion: string, marca: string): Promise<boolean> {
    this.consultasDeMarca.push({ idConversacion, marca });
    return Promise.resolve(this.existeMarca);
  }

  cambiarEstado(idConversacion: string, estado: string): Promise<void> {
    if (this.falloAEmitir) return Promise.reject(this.falloAEmitir);
    this.estadosCambiados.push({ idConversacion, estado });
    return Promise.resolve();
  }

  agregarEtiquetas(idConversacion: string, etiquetas: readonly string[]): Promise<void> {
    if (this.falloAEmitir) return Promise.reject(this.falloAEmitir);
    this.etiquetasAgregadas.push({ idConversacion, etiquetas });
    return Promise.resolve();
  }
}

function entradaMensaje(overrides: Partial<EntradaOutbox> = {}): EntradaOutbox {
  return {
    id: 'fila-1',
    tipo: TIPO_OUTBOX_MENSAJE,
    claveIdempotencia: 'canal:mensaje:42:r1:00',
    grupo: 'canal:42',
    orden: 0,
    datos: { idConversacion: '42', secuencia: 'r1', paso: 0, total: 1 },
    efimero: { texto: 'hola' },
    intento: 1,
    ...overrides,
  };
}

describe('modulos/canales/aplicacion/PublicarEfectoCanal (D9, D10, D13)', () => {
  it('canal.mensaje en el primer intento envía directo, sin consultar existeMensajeConMarca', async () => {
    const adaptador = new AdaptadorCanalFalso();
    const manejador = new PublicarEfectoCanal(adaptador);

    await manejador.publicar(entradaMensaje({ intento: 1 }));

    expect(adaptador.enviados).toEqual([{ idConversacion: '42', texto: 'hola', marca: 'canal:mensaje:42:r1:00' }]);
    expect(adaptador.consultasDeMarca).toEqual([]);
  });

  it('D13 — canal.mensaje con intento > 1 y marca ya existente no reenvía', async () => {
    const adaptador = new AdaptadorCanalFalso(true);
    const manejador = new PublicarEfectoCanal(adaptador);

    await manejador.publicar(entradaMensaje({ intento: 2 }));

    expect(adaptador.consultasDeMarca).toEqual([{ idConversacion: '42', marca: 'canal:mensaje:42:r1:00' }]);
    expect(adaptador.enviados).toEqual([]);
  });

  it('D13 — canal.mensaje con intento > 1 y marca inexistente reenvía', async () => {
    const adaptador = new AdaptadorCanalFalso(false);
    const manejador = new PublicarEfectoCanal(adaptador);

    await manejador.publicar(entradaMensaje({ intento: 2 }));

    expect(adaptador.consultasDeMarca).toEqual([{ idConversacion: '42', marca: 'canal:mensaje:42:r1:00' }]);
    expect(adaptador.enviados).toEqual([{ idConversacion: '42', texto: 'hola', marca: 'canal:mensaje:42:r1:00' }]);
  });

  it('canal.estado traduce la fila a cambiarEstado con el estado de "datos"', async () => {
    const adaptador = new AdaptadorCanalFalso();
    const manejador = new PublicarEfectoCanal(adaptador);

    await manejador.publicar(
      entradaMensaje({
        tipo: TIPO_OUTBOX_ESTADO,
        claveIdempotencia: 'canal:estado:42:op1',
        datos: { idConversacion: '42', estado: 'resuelta' },
        efimero: undefined,
      }),
    );

    expect(adaptador.estadosCambiados).toEqual([{ idConversacion: '42', estado: 'resuelta' }]);
  });

  it('canal.etiquetas traduce la fila a agregarEtiquetas con las etiquetas de "datos"', async () => {
    const adaptador = new AdaptadorCanalFalso();
    const manejador = new PublicarEfectoCanal(adaptador);

    await manejador.publicar(
      entradaMensaje({
        tipo: TIPO_OUTBOX_ETIQUETAS,
        claveIdempotencia: 'canal:etiquetas:42:op1',
        datos: { idConversacion: '42', etiquetas: ['vip'] },
        efimero: undefined,
      }),
    );

    expect(adaptador.etiquetasAgregadas).toEqual([{ idConversacion: '42', etiquetas: ['vip'] }]);
  });

  it('un FalloCanal del adaptador se traduce a FalloPublicacion con la misma naturaleza y causa', async () => {
    const fallo = new FalloCanal('transitorio', 'POST /x: 500', 7);
    const adaptador = new AdaptadorCanalFalso(false, fallo);
    const manejador = new PublicarEfectoCanal(adaptador);

    const resultado = await manejador.publicar(entradaMensaje({ intento: 1 })).catch((error: unknown) => error);

    expect(resultado).toBeInstanceOf(FalloPublicacion);
    expect((resultado as FalloPublicacion).clase).toBe('transitorio');
    expect((resultado as FalloPublicacion).causa).toBe('POST /x: 500');
    expect((resultado as FalloPublicacion).esperaSugeridaS).toBe(7);
  });

  it('un tipo de outbox no reconocido lanza FalloPublicacion permanente', async () => {
    const adaptador = new AdaptadorCanalFalso();
    const manejador = new PublicarEfectoCanal(adaptador);

    const resultado = await manejador
      .publicar(entradaMensaje({ tipo: 'canal.desconocido' }))
      .catch((error: unknown) => error);

    expect(resultado).toBeInstanceOf(FalloPublicacion);
    expect((resultado as FalloPublicacion).clase).toBe('permanente');
  });

  it('datos malformados (sin idConversacion) lanzan en vez de fallar en silencio', async () => {
    const adaptador = new AdaptadorCanalFalso();
    const manejador = new PublicarEfectoCanal(adaptador);

    await expect(
      manejador.publicar(entradaMensaje({ datos: { secuencia: 'r1', paso: 0, total: 1 } })),
    ).rejects.toThrow();
  });

  it('un mensaje sin texto efímero lanza en vez de enviar un mensaje vacío', async () => {
    const adaptador = new AdaptadorCanalFalso();
    const manejador = new PublicarEfectoCanal(adaptador);

    await expect(manejador.publicar(entradaMensaje({ efimero: undefined }))).rejects.toThrow();
  });
});
