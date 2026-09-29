import { TemporizadorReal } from './temporizador-real.js';

describe('modulos/llm/infraestructura — TemporizadorReal', () => {
  it('esperar resuelve pasado el tiempo pedido', async () => {
    const temporizador = new TemporizadorReal();
    const inicio = performance.now();

    await temporizador.esperar(30);

    expect(performance.now() - inicio).toBeGreaterThanOrEqual(25);
  });

  it('programar ejecuta la acción tras el plazo', async () => {
    const temporizador = new TemporizadorReal();
    const accion = vi.fn();

    temporizador.programar(10, accion);
    expect(accion).not.toHaveBeenCalled();
    await temporizador.esperar(40);

    expect(accion).toHaveBeenCalledTimes(1);
  });

  it('cancelar lo programado evita que la acción corra', async () => {
    const temporizador = new TemporizadorReal();
    const accion = vi.fn();

    const cancelar = temporizador.programar(10, accion);
    cancelar();
    await temporizador.esperar(40);

    expect(accion).not.toHaveBeenCalled();
  });

  it('azar devuelve números en [0, 1) que no son siempre el mismo', () => {
    const temporizador = new TemporizadorReal();

    const muestras = Array.from({ length: 50 }, () => temporizador.azar());

    expect(muestras.every((valor) => valor >= 0 && valor < 1)).toBe(true);
    expect(new Set(muestras).size).toBeGreaterThan(1);
  });
});
