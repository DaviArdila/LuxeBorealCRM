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
