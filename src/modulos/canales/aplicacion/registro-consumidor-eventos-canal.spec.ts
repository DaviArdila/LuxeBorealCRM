import { describe, expect, it } from 'vitest';
import type { ConsumidorEventosCanal } from '../puertos/consumidor-eventos-canal.js';
import { RegistroConsumidorEventosCanal } from './registro-consumidor-eventos-canal.js';

class ConsumidorDePrueba implements ConsumidorEventosCanal {
  async consumir(): Promise<void> {
    // sin cuerpo: solo distingue identidad de instancia en los tests.
  }
}

describe('RegistroConsumidorEventosCanal (T4, D8)', () => {
  it('obtener devuelve el consumidor de por defecto cuando nadie se ha registrado', () => {
    const porDefecto = new ConsumidorDePrueba();
    const registro = new RegistroConsumidorEventosCanal(porDefecto);

    expect(registro.obtener()).toBe(porDefecto);
  });

  it('registrar sustituye al consumidor de por defecto', () => {
    const porDefecto = new ConsumidorDePrueba();
    const propio = new ConsumidorDePrueba();
    const registro = new RegistroConsumidorEventosCanal(porDefecto);

    registro.registrar(propio);

    expect(registro.obtener()).toBe(propio);
  });

  it('registrar el mismo consumidor dos veces no lanza (idempotente)', () => {
    const porDefecto = new ConsumidorDePrueba();
    const propio = new ConsumidorDePrueba();
    const registro = new RegistroConsumidorEventosCanal(porDefecto);

    registro.registrar(propio);

    expect(() => registro.registrar(propio)).not.toThrow();
  });

  it('registrar un consumidor distinto cuando ya hay uno propio lanza (D8)', () => {
    const porDefecto = new ConsumidorDePrueba();
    const primero = new ConsumidorDePrueba();
    const segundo = new ConsumidorDePrueba();
    const registro = new RegistroConsumidorEventosCanal(porDefecto);

    registro.registrar(primero);

    expect(() => registro.registrar(segundo)).toThrow();
  });
});
