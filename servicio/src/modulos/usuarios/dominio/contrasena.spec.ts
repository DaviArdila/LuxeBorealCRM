import { describe, expect, it } from 'vitest';
import { LONGITUD_MAXIMA_CONTRASENA, LONGITUD_MINIMA_CONTRASENA, validarContrasenaNueva } from './contrasena.js';

// USR10: la contraseña nueva tiene al menos 12 caracteres y se escribe igual dos veces. El máximo de
// 200 coincide con el límite del inicio de sesión (design.md «Endpoints»): una contraseña más larga
// se podría crear pero nunca usar.

describe('modulos/usuarios/dominio — validarContrasenaNueva', () => {
  it('los límites son 12 y 200 caracteres', () => {
    expect(LONGITUD_MINIMA_CONTRASENA).toBe(12);
    expect(LONGITUD_MAXIMA_CONTRASENA).toBe(200);
  });

  it('acepta una contraseña de 12 caracteres repetida igual', () => {
    expect(validarContrasenaNueva('abcdefghijkl', 'abcdefghijkl')).toEqual({ valida: true });
  });

  it('rechaza una contraseña de 11 caracteres por corta', () => {
    expect(validarContrasenaNueva('abcdefghijk', 'abcdefghijk')).toEqual({ valida: false, motivo: 'corta' });
  });

  it('rechaza dos contraseñas distintas', () => {
    expect(validarContrasenaNueva('abcdefghijkl', 'abcdefghijkm')).toEqual({ valida: false, motivo: 'no-coincide' });
  });

  it('rechaza una contraseña de más de 200 caracteres', () => {
    const larga = 'a'.repeat(201);

    expect(validarContrasenaNueva(larga, larga)).toEqual({ valida: false, motivo: 'larga' });
  });

  it('cuenta caracteres, no unidades UTF-16: 12 emojis bastan', () => {
    const emojis = '🔒'.repeat(12);

    expect(validarContrasenaNueva(emojis, emojis)).toEqual({ valida: true });
  });

  it('la corta gana sobre la que no coincide: primero se dice el motivo de la primera', () => {
    expect(validarContrasenaNueva('corta', 'otra')).toEqual({ valida: false, motivo: 'corta' });
  });
});
