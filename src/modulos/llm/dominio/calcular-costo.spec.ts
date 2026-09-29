import { calcularCostoEstimado, inicioMesUTC, microUsdAUsd } from './calcular-costo.js';

// D6/D7 de `openspec/changes/fase-06-pasarela-llm/design.md`: aritmética entera en micro-USD (R2).

const LUNA = { entrada: 0.2, salida: 1.2, cache: 0.02 } as const;

describe('modulos/llm/dominio — calcularCostoEstimado (micro-USD, R2)', () => {
  it('suma entrada y salida en micro-USD enteros con los precios por millón de tokens', () => {
    const costo = calcularCostoEstimado(
      { tokensEntrada: 1000, tokensSalida: 500, tokensCache: 0 },
      LUNA,
    );

    expect(costo).toBe(800);
  });

  it('cobra los tokens de caché con el precio de caché', () => {
    const costo = calcularCostoEstimado(
      { tokensEntrada: 1000, tokensSalida: 500, tokensCache: 10_000 },
      LUNA,
    );

    expect(costo).toBe(1000);
  });

  it('un uso sin tokens cuesta cero', () => {
    const costo = calcularCostoEstimado({ tokensEntrada: 0, tokensSalida: 0, tokensCache: 0 }, LUNA);

    expect(costo).toBe(0);
  });

  it('redondea al micro-USD más cercano, la mitad hacia arriba', () => {
    const precio = { entrada: 0.1, salida: 0, cache: 0 };

    expect(calcularCostoEstimado({ tokensEntrada: 5, tokensSalida: 0, tokensCache: 0 }, precio)).toBe(
      1,
    );
    expect(calcularCostoEstimado({ tokensEntrada: 4, tokensSalida: 0, tokensCache: 0 }, precio)).toBe(
      0,
    );
    expect(calcularCostoEstimado({ tokensEntrada: 3, tokensSalida: 0, tokensCache: 0 }, LUNA)).toBe(
      1,
    );
  });

  it('un precio de caché en cero no suma nada aunque haya tokens de caché', () => {
    const costo = calcularCostoEstimado(
      { tokensEntrada: 0, tokensSalida: 0, tokensCache: 50_000 },
      { entrada: 0.2, salida: 1.2, cache: 0 },
    );

    expect(costo).toBe(0);
  });

  it('es exacto con un millón de tokens de entrada y de salida', () => {
    const costo = calcularCostoEstimado(
      { tokensEntrada: 1_000_000, tokensSalida: 1_000_000, tokensCache: 0 },
      LUNA,
    );

    expect(costo).toBe(1_400_000);
  });
});

describe('modulos/llm/dominio — microUsdAUsd', () => {
  it('convierte micro-USD enteros a USD con seis decimales', () => {
    expect(microUsdAUsd(800)).toBe(0.0008);
    expect(microUsdAUsd(1_400_000)).toBe(1.4);
    expect(microUsdAUsd(0)).toBe(0);
  });
});

describe('modulos/llm/dominio — inicioMesUTC (D7)', () => {
  it('devuelve el primer instante del mes UTC de la fecha', () => {
    expect(inicioMesUTC(new Date('2026-09-28T23:59:59.000Z')).toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    );
  });

  it('en el último milisegundo del mes sigue en ese mes, no en el siguiente', () => {
    expect(inicioMesUTC(new Date('2026-08-31T23:59:59.999Z')).toISOString()).toBe(
      '2026-08-01T00:00:00.000Z',
    );
  });

  it('en el primer instante del año devuelve ese mismo instante', () => {
    expect(inicioMesUTC(new Date('2027-01-01T00:00:00.000Z')).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });
});
