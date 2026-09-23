import { ClockFalso } from './clock-falso.js';

// PLT2 — "Un test fija el tiempo con ClockFalso".

describe('ClockFalso', () => {
  it('fijar(fecha) hace que ahora() devuelva esa fecha exacta', () => {
    const clock = new ClockFalso();
    const fecha = new Date('2026-09-23T10:00:00.000Z');

    clock.fijar(fecha);

    expect(clock.ahora()).toEqual(fecha);
  });

  it('avanzar(ms) desplaza la fecha fijada por la cantidad exacta de milisegundos', () => {
    const clock = new ClockFalso();
    clock.fijar(new Date('2026-09-23T10:00:00.000Z'));

    clock.avanzar(90_000);

    expect(clock.ahora()).toEqual(new Date('2026-09-23T10:01:30.000Z'));
  });
});
