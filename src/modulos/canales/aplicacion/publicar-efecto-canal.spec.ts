import { describe, expect, it } from 'vitest';
import type { EntradaOutbox } from '../../../plataforma/outbox/index.js';
import { FalloPublicacion } from '../../../plataforma/outbox/index.js';
import { FalloCanal, type AdaptadorCanal } from '../puertos/adaptador-canal.js';
import type { GuardiaEnvioCanal } from '../puertos/guardia-envio-canal.js';
import { PublicarEfectoCanal } from './publicar-efecto-canal.js';
import { RegistroGuardiaEnvioCanal } from './registro-guardia-envio-canal.js';
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

/** Doble de {@link GuardiaEnvioCanal}: responde lo programado y registra cada consulta. */
class GuardiaFalsa implements GuardiaEnvioCanal {
  readonly consultas: { idConversacion: string; requiereEstado: string }[] = [];

  constructor(private readonly respuesta: boolean) {}

  puedeEnviar(idConversacion: string, requiereEstado: string): Promise<boolean> {
    this.consultas.push({ idConversacion, requiereEstado });
    return Promise.resolve(this.respuesta);
  }
}

function manejadorConGuardia(adaptador: AdaptadorCanal, guardia: GuardiaEnvioCanal | undefined): PublicarEfectoCanal {
  const registro = new RegistroGuardiaEnvioCanal();
  if (guardia !== undefined) registro.registrar(guardia);
  return new PublicarEfectoCanal(adaptador, registro);
}

describe('modulos/canales/aplicacion/PublicarEfectoCanal (D9, D10, D13)', () => {
  it('canal.mensaje en el primer intento envía directo, sin consultar existeMensajeConMarca', async () => {
    const adaptador = new AdaptadorCanalFalso();
    const manejador = new PublicarEfectoCanal(adaptador, new RegistroGuardiaEnvioCanal());

    await manejador.publicar(entradaMensaje({ intento: 1 }));

    expect(adaptador.enviados).toEqual([{ idConversacion: '42', texto: 'hola', marca: 'canal:mensaje:42:r1:00' }]);
    expect(adaptador.consultasDeMarca).toEqual([]);
  });

  it('D13 — canal.mensaje con intento > 1 y marca ya existente no reenvía', async () => {
    const adaptador = new AdaptadorCanalFalso(true);
    const manejador = new PublicarEfectoCanal(adaptador, new RegistroGuardiaEnvioCanal());

    await manejador.publicar(entradaMensaje({ intento: 2 }));

    expect(adaptador.consultasDeMarca).toEqual([{ idConversacion: '42', marca: 'canal:mensaje:42:r1:00' }]);
    expect(adaptador.enviados).toEqual([]);
  });

  it('D13 — canal.mensaje con intento > 1 y marca inexistente reenvía', async () => {
    const adaptador = new AdaptadorCanalFalso(false);
    const manejador = new PublicarEfectoCanal(adaptador, new RegistroGuardiaEnvioCanal());

    await manejador.publicar(entradaMensaje({ intento: 2 }));

    expect(adaptador.consultasDeMarca).toEqual([{ idConversacion: '42', marca: 'canal:mensaje:42:r1:00' }]);
    expect(adaptador.enviados).toEqual([{ idConversacion: '42', texto: 'hola', marca: 'canal:mensaje:42:r1:00' }]);
  });

  it('canal.estado traduce la fila a cambiarEstado con el estado de "datos"', async () => {
    const adaptador = new AdaptadorCanalFalso();
    const manejador = new PublicarEfectoCanal(adaptador, new RegistroGuardiaEnvioCanal());

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
    const manejador = new PublicarEfectoCanal(adaptador, new RegistroGuardiaEnvioCanal());

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
    const manejador = new PublicarEfectoCanal(adaptador, new RegistroGuardiaEnvioCanal());

    const resultado = await manejador.publicar(entradaMensaje({ intento: 1 })).catch((error: unknown) => error);

    expect(resultado).toBeInstanceOf(FalloPublicacion);
    expect((resultado as FalloPublicacion).clase).toBe('transitorio');
    expect((resultado as FalloPublicacion).causa).toBe('POST /x: 500');
    expect((resultado as FalloPublicacion).esperaSugeridaS).toBe(7);
  });

  it('un tipo de outbox no reconocido lanza FalloPublicacion permanente', async () => {
    const adaptador = new AdaptadorCanalFalso();
    const manejador = new PublicarEfectoCanal(adaptador, new RegistroGuardiaEnvioCanal());

    const resultado = await manejador
      .publicar(entradaMensaje({ tipo: 'canal.desconocido' }))
      .catch((error: unknown) => error);

    expect(resultado).toBeInstanceOf(FalloPublicacion);
    expect((resultado as FalloPublicacion).clase).toBe('permanente');
  });

  it('datos malformados (sin idConversacion) lanzan en vez de fallar en silencio', async () => {
    const adaptador = new AdaptadorCanalFalso();
    const manejador = new PublicarEfectoCanal(adaptador, new RegistroGuardiaEnvioCanal());

    await expect(
      manejador.publicar(entradaMensaje({ datos: { secuencia: 'r1', paso: 0, total: 1 } })),
    ).rejects.toThrow();
  });

  it('un mensaje sin texto efímero lanza en vez de enviar un mensaje vacío', async () => {
    const adaptador = new AdaptadorCanalFalso();
    const manejador = new PublicarEfectoCanal(adaptador, new RegistroGuardiaEnvioCanal());

    await expect(manejador.publicar(entradaMensaje({ efimero: undefined }))).rejects.toThrow();
  });

  describe('CAN9 — guardia de envío por paso', () => {
    const conEstado = (): EntradaOutbox =>
      entradaMensaje({ datos: { idConversacion: '42', secuencia: 'r1', paso: 0, total: 2, requiereEstado: 'bot' } });

    it('CAN9 — La guardia niega el envío y la secuencia se aborta', async () => {
      const adaptador = new AdaptadorCanalFalso();
      const guardia = new GuardiaFalsa(false);
      const manejador = manejadorConGuardia(adaptador, guardia);

      const resultado = await manejador.publicar(conEstado()).catch((error: unknown) => error);

      expect(adaptador.enviados).toEqual([]);
      expect(adaptador.consultasDeMarca).toEqual([]);
      expect(resultado).toBeInstanceOf(FalloPublicacion);
      // 'permanente' es lo que hace que el outbox marque el paso con error y aborte la secuencia
      expect((resultado as FalloPublicacion).clase).toBe('permanente');
      expect((resultado as FalloPublicacion).causa).toBe('estado-cambio');
      expect(guardia.consultas).toEqual([{ idConversacion: '42', requiereEstado: 'bot' }]);
    });

    it('la guardia que acepta deja enviar el paso', async () => {
      const adaptador = new AdaptadorCanalFalso();
      const manejador = manejadorConGuardia(adaptador, new GuardiaFalsa(true));

      await manejador.publicar(conEstado());

      expect(adaptador.enviados).toHaveLength(1);
    });

    it('CAN9 — Un paso sin estado requerido se envía sin consultar la guardia', async () => {
      const adaptador = new AdaptadorCanalFalso();
      const guardia = new GuardiaFalsa(false);
      const manejador = manejadorConGuardia(adaptador, guardia);

      await manejador.publicar(entradaMensaje());

      expect(adaptador.enviados).toHaveLength(1);
      expect(guardia.consultas).toEqual([]);
    });

    it('CAN9 — Sin guardia registrada el paso con estado requerido se envía como antes', async () => {
      const adaptador = new AdaptadorCanalFalso();
      const manejador = manejadorConGuardia(adaptador, undefined);

      await manejador.publicar(conEstado());

      expect(adaptador.enviados).toHaveLength(1);
    });

    it('la guardia solo aplica a canal.mensaje: un cambio de estado no la consulta', async () => {
      const adaptador = new AdaptadorCanalFalso();
      const guardia = new GuardiaFalsa(false);
      const manejador = manejadorConGuardia(adaptador, guardia);

      await manejador.publicar(
        entradaMensaje({
          tipo: TIPO_OUTBOX_ESTADO,
          datos: { idConversacion: '42', estado: 'abierta', requiereEstado: 'bot' },
          efimero: undefined,
        }),
      );

      expect(adaptador.estadosCambiados).toHaveLength(1);
      expect(guardia.consultas).toEqual([]);
    });
  });
});
