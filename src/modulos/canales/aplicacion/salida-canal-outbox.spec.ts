import { describe, expect, it } from 'vitest';
import { MAX_PASOS_SECUENCIA } from '../dominio/claves-idempotencia.js';
import type { NuevaEntradaOutbox, RegistroOutbox } from '../../../plataforma/outbox/index.js';
import { SalidaCanalOutbox, TIPO_OUTBOX_ESTADO, TIPO_OUTBOX_ETIQUETAS, TIPO_OUTBOX_MENSAJE } from './salida-canal-outbox.js';

/** Doble de {@link RegistroOutbox} que registra cada llamada (mismo patrón que `RepositorioEventoEntranteFalso`). */
class RegistroOutboxFalso implements RegistroOutbox {
  readonly llamadas: (readonly NuevaEntradaOutbox[])[] = [];

  agregar(entradas: readonly NuevaEntradaOutbox[]): Promise<void> {
    this.llamadas.push(entradas);
    return Promise.resolve();
  }
}

describe('modulos/canales/aplicacion/SalidaCanalOutbox (D9, D10, D11)', () => {
  it('enviarMensajes encola un paso por mensaje, mismo grupo, con el texto en efimero', async () => {
    const registro = new RegistroOutboxFalso();
    const salida = new SalidaCanalOutbox(registro);

    await salida.enviarMensajes({
      idConversacion: '42',
      idRespuesta: 'r1',
      mensajes: [{ tipo: 'texto', texto: 'hola' }, { tipo: 'texto', texto: '¿en qué te ayudo?' }],
    });

    expect(registro.llamadas).toEqual([
      [
        {
          tipo: TIPO_OUTBOX_MENSAJE,
          claveIdempotencia: 'canal:mensaje:42:r1:00',
          grupo: 'canal:42',
          orden: 0,
          datos: { idConversacion: '42', secuencia: 'r1', paso: 0, total: 2 },
          efimero: { texto: 'hola' },
        },
        {
          tipo: TIPO_OUTBOX_MENSAJE,
          claveIdempotencia: 'canal:mensaje:42:r1:01',
          grupo: 'canal:42',
          orden: 1,
          datos: { idConversacion: '42', secuencia: 'r1', paso: 1, total: 2 },
          efimero: { texto: '¿en qué te ayudo?' },
        },
      ],
    ]);
  });

  it('enviarMensajes con una lista vacía lanza (contrato: 1..MAX_PASOS_SECUENCIA)', async () => {
    const salida = new SalidaCanalOutbox(new RegistroOutboxFalso());

    await expect(
      salida.enviarMensajes({ idConversacion: '42', idRespuesta: 'r1', mensajes: [] }),
    ).rejects.toThrow();
  });

  it('enviarMensajes con más de MAX_PASOS_SECUENCIA mensajes lanza', async () => {
    const salida = new SalidaCanalOutbox(new RegistroOutboxFalso());
    const mensajes = Array.from({ length: MAX_PASOS_SECUENCIA + 1 }, () => ({
      tipo: 'texto' as const,
      texto: 'x',
    }));

    await expect(
      salida.enviarMensajes({ idConversacion: '42', idRespuesta: 'r1', mensajes }),
    ).rejects.toThrow();
  });

  it('cambiarEstado encola una fila canal.estado con la clave de la operación', async () => {
    const registro = new RegistroOutboxFalso();
    const salida = new SalidaCanalOutbox(registro);

    await salida.cambiarEstado({ idConversacion: '42', idOperacion: 'op1', estado: 'resuelta' });

    expect(registro.llamadas).toEqual([
      [
        {
          tipo: TIPO_OUTBOX_ESTADO,
          claveIdempotencia: 'canal:estado:42:op1',
          grupo: 'canal:42',
          orden: 0,
          datos: { idConversacion: '42', estado: 'resuelta' },
        },
      ],
    ]);
  });

  it('agregarEtiquetas encola una fila canal.etiquetas con la clave de la operación', async () => {
    const registro = new RegistroOutboxFalso();
    const salida = new SalidaCanalOutbox(registro);

    await salida.agregarEtiquetas({ idConversacion: '42', idOperacion: 'op1', etiquetas: ['vip'] });

    expect(registro.llamadas).toEqual([
      [
        {
          tipo: TIPO_OUTBOX_ETIQUETAS,
          claveIdempotencia: 'canal:etiquetas:42:op1',
          grupo: 'canal:42',
          orden: 0,
          datos: { idConversacion: '42', etiquetas: ['vip'] },
        },
      ],
    ]);
  });
});
