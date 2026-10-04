import { describe, expect, it } from 'vitest';
import { RegistroManejadoresOutbox } from './registro-manejadores.js';
import type { ManejadorOutbox } from './tipos.js';

class ManejadorDePrueba implements ManejadorOutbox {
  publicar(): Promise<void> {
    // Sin parámetro ni cuerpo: solo distingue identidad de instancia en los tests. TypeScript
    // permite que un método de clase declare menos parámetros que la interfaz que implementa.
    return Promise.resolve();
  }
}

describe('RegistroManejadoresOutbox (T6, D10)', () => {
  it('obtener devuelve undefined cuando nadie registró ese tipo', () => {
    const registro = new RegistroManejadoresOutbox();

    expect(registro.obtener('canal.mensaje')).toBeUndefined();
  });

  it('registrar hace que obtener devuelva el manejador de ese tipo', () => {
    const registro = new RegistroManejadoresOutbox();
    const manejador = new ManejadorDePrueba();

    registro.registrar('canal.mensaje', manejador);

    expect(registro.obtener('canal.mensaje')).toBe(manejador);
  });

  it('dos tipos distintos conviven sin pisarse', () => {
    const registro = new RegistroManejadoresOutbox();
    const manejadorMensaje = new ManejadorDePrueba();
    const manejadorEstado = new ManejadorDePrueba();

    registro.registrar('canal.mensaje', manejadorMensaje);
    registro.registrar('canal.estado', manejadorEstado);

    expect(registro.obtener('canal.mensaje')).toBe(manejadorMensaje);
    expect(registro.obtener('canal.estado')).toBe(manejadorEstado);
  });

  it('registrar dos veces el mismo tipo lanza (D10: nadie decide cuál gana)', () => {
    const registro = new RegistroManejadoresOutbox();
    registro.registrar('canal.mensaje', new ManejadorDePrueba());

    expect(() => registro.registrar('canal.mensaje', new ManejadorDePrueba())).toThrow();
  });
});
