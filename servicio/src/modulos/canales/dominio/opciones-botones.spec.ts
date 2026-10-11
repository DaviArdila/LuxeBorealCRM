import { describe, expect, it } from 'vitest';
import {
  MAX_OPCIONES_BOTONES,
  MAX_TITULO_BOTON,
  OpcionesBotonesInvalidas,
  enumerarOpciones,
  validarOpcionesBotones,
} from './opciones-botones.js';

describe('validarOpcionesBotones (botones de respuesta, Meta: 1 a 3 y título de hasta 20)', () => {
  it('acepta de una a tres opciones y devuelve los títulos recortados', () => {
    expect(validarOpcionesBotones([' Sí, autorizo ', 'No autorizo'])).toEqual(['Sí, autorizo', 'No autorizo']);
    expect(validarOpcionesBotones(['Uno'])).toEqual(['Uno']);
    expect(validarOpcionesBotones(['a', 'b', 'c'])).toHaveLength(MAX_OPCIONES_BOTONES);
  });

  it('acepta un título de exactamente 20 caracteres', () => {
    const titulo = 'x'.repeat(MAX_TITULO_BOTON);
    expect(validarOpcionesBotones([titulo])).toEqual([titulo]);
  });

  it('rechaza cero opciones y más de tres, sin recortar en silencio', () => {
    expect(() => validarOpcionesBotones([])).toThrow(OpcionesBotonesInvalidas);
    expect(() => validarOpcionesBotones(['a', 'b', 'c', 'd'])).toThrow(/entre 1 y 3/);
  });

  it('rechaza un título de más de 20 caracteres nombrando el límite pero no el texto (R14)', () => {
    const largo = 'y'.repeat(MAX_TITULO_BOTON + 1);
    expect(() => validarOpcionesBotones([largo])).toThrow(/20 caracteres/);
    expect(() => validarOpcionesBotones([largo])).not.toThrow(largo);
  });

  it('rechaza un título vacío o solo espacios', () => {
    expect(() => validarOpcionesBotones(['  '])).toThrow(/vacío/);
  });

  it('rechaza títulos repetidos (el clic llega como el título, sin id): se comparan sin mayúsculas ni espacios sobrantes', () => {
    expect(() => validarOpcionesBotones(['Sí', ' sí '])).toThrow(/repetid/);
  });
});

describe('enumerarOpciones (respaldo en texto para canales sin botones)', () => {
  it('numera cada opción en su propia línea, para contestar con el número o el título', () => {
    expect(enumerarOpciones(['Sí, autorizo', 'No autorizo'])).toBe('1. Sí, autorizo\n2. No autorizo');
  });
});
