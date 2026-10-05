import { asegurarMensajeLiteral } from './asegurar-mensaje-literal.js';

// R2: el mensaje de «sin cobertura» sale del backend tal cual lo configuró el negocio, no parafraseado.

const MENSAJE = 'Por ahora no llegamos a ese destino.';

describe('modulos/agente/dominio — asegurarMensajeLiteral', () => {
  it('si el texto ya contiene el mensaje literal, no lo duplica', () => {
    const texto = `Lo siento. ${MENSAJE} ¿Tienes otra dirección?`;

    expect(asegurarMensajeLiteral(texto, MENSAJE)).toBe(texto);
  });

  it('si el texto lo parafrasea, añade el mensaje literal al final en un párrafo aparte', () => {
    const texto = 'No tenemos envíos allá, ¿tienes otra dirección?';

    expect(asegurarMensajeLiteral(texto, MENSAJE)).toBe(`${texto}\n\n${MENSAJE}`);
  });

  it('tolera diferencias de espacios y saltos de línea al detectar el literal', () => {
    const texto = 'Por ahora   no llegamos\na ese destino.';

    expect(asegurarMensajeLiteral(texto, MENSAJE)).toBe(texto);
  });

  it('un mensaje vacío no cambia el texto', () => {
    expect(asegurarMensajeLiteral('Hola', '  ')).toBe('Hola');
  });

  it('no confunde mayúsculas ni signos distintos con el literal', () => {
    const texto = 'por ahora no llegamos a ese destino';

    expect(asegurarMensajeLiteral(texto, MENSAJE)).toBe(`${texto}\n\n${MENSAJE}`);
  });
});
