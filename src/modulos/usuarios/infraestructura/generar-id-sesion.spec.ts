import { describe, expect, it } from 'vitest';
import { generarIdSesion } from './generar-id-sesion.js';

// USR2/USR3: el id de la sesión son 256 bits aleatorios en base64url (43 caracteres, sin relleno).

describe('modulos/usuarios/infraestructura — generarIdSesion', () => {
  it('produce 43 caracteres base64url', () => {
    expect(generarIdSesion()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('dos ids seguidos son distintos', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generarIdSesion()));

    expect(ids.size).toBe(100);
  });
});
