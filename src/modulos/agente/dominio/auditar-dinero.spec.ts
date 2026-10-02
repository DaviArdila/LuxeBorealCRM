import { contarMontosSinRastro } from './auditar-dinero.js';

describe('modulos/agente/dominio — contarMontosSinRastro (D9)', () => {
  it('un monto que viene de una herramienta tiene rastro, sin importar el formato', () => {
    const resultados = [{ precio_texto: '$ 389.000' }];

    expect(contarMontosSinRastro('Cuesta $389.000 con envío', resultados)).toBe(0);
  });

  it('cuenta los montos que ninguna herramienta devolvió', () => {
    const resultados = [{ precio_texto: '$389.000' }];

    expect(contarMontosSinRastro('Son $389.000, más $25.000 de envío y $ 5.000 extra', resultados)).toBe(2);
  });

  it('un texto sin montos no tiene nada que auditar', () => {
    expect(contarMontosSinRastro('Hola, ¿en qué te ayudo?', [])).toBe(0);
  });
});

describe('modulos/agente/dominio — contarMontosSinRastro: otras formas de escribir dinero', () => {
  const sinRastro = (texto: string) => contarMontosSinRastro(texto, [{ otro: 'nada' }]);

  it.each([
    ['15.000 pesos', 'Te cuesta 15.000 pesos'],
    ['15000 pesos', 'Te cuesta 15000 pesos'],
    ['15 mil pesos', 'Te cuesta 15 mil pesos'],
    ['$15 mil', 'Te cuesta $15 mil'],
    ['COP 15000', 'Te cuesta COP 15000'],
    ['COP15.000', 'Te cuesta COP15.000'],
    ['15.000 COP', 'Te cuesta 15.000 COP'],
    ['1,5 millones de pesos', 'Te cuesta 1,5 millones de pesos'],
  ])('detecta %s cuando ninguna herramienta lo devolvió', (_forma, texto) => {
    expect(sinRastro(texto)).toBe(1);
  });

  it.each([
    ['15.000 pesos', 'Te cuesta 15.000 pesos', [{ precio_texto: '$15.000' }]],
    ['15 mil pesos', 'Te cuesta 15 mil pesos', [{ precio: 15000 }]],
    ['$15 mil', 'Te cuesta $15 mil', [{ precio_texto: '$ 15.000' }]],
    ['COP 15000', 'Te cuesta COP 15000', [{ precio_texto: '$15.000' }]],
    ['1,5 millones de pesos', 'Cuesta 1,5 millones de pesos', [{ precio: 1500000 }]],
    ['15.000 COP', 'Te cuesta 15.000 COP', [{ texto: 'Envío de 15 mil pesos' }]],
  ])('%s con rastro en herramientas no cuenta', (_forma, texto, resultados) => {
    expect(contarMontosSinRastro(texto, resultados)).toBe(0);
  });

  it('compara el valor completo: 15 mil no se respalda con un 15 suelto ni con 150.000', () => {
    expect(contarMontosSinRastro('Cuesta 15 mil pesos', [{ cantidad: 15 }])).toBe(1);
    expect(contarMontosSinRastro('Cuesta $15.000', [{ precio_texto: '$150.000' }])).toBe(1);
  });

  it('mantiene $15.000 y la suma entre paréntesis con rastro', () => {
    const resultados = [{ total: '$271.000', producto: '$259.000', envio: '$12.000' }];

    expect(contarMontosSinRastro('Son $271.000 (259.000 + 12.000)', resultados)).toBe(0);
    expect(contarMontosSinRastro('Son $271.000 (259.000 + 12.000)', [])).toBe(1);
    expect(contarMontosSinRastro('Cuesta $15.000.', [])).toBe(1);
  });

  it('cuenta cada monto de un texto con varias formas', () => {
    expect(sinRastro('Son $389.000 y 25 mil pesos de envío, o COP 5000')).toBe(3);
  });

  it.each([
    'Llega en 2 días hábiles',
    'Desde 2024 estamos en Medellín',
    'Escríbenos al 300 123 4567',
    'Tenemos 15 mil seguidores',
    'Te mando 3 fotos y 2 días de plazo',
    'Pedido número 15.000 del año',
  ])('no es dinero: %s', (texto) => {
    expect(sinRastro(texto)).toBe(0);
  });
});
