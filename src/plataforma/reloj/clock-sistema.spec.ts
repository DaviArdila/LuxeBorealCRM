import { ClockSistema } from './clock-sistema.js';

// PLT2 — "El código de aplicación lee la hora del Clock inyectado": este test verifica el
// adaptador de sistema. Es la única excepción del repo autorizada a llamar Date.now() (regla de
// lint "Reloj", D10 de design.md), y solo dentro de este propio archivo.

describe('ClockSistema', () => {
  it('ahora() devuelve una fecha cercana al reloj real del sistema', () => {
    const clock = new ClockSistema();
    const antes = Date.now();

    const resultado = clock.ahora();

    const despues = Date.now();
    expect(resultado).toBeInstanceOf(Date);
    expect(resultado.getTime()).toBeGreaterThanOrEqual(antes);
    expect(resultado.getTime()).toBeLessThanOrEqual(despues);
  });
});
