import { describe, expect, it } from 'vitest';
import { LectorContrasenaFalso } from '../test/fakes/lector-contrasena-falso.js';
import { ejecutarCrearUsuario, parsearArgumentosUsuario } from './usuario-crear.js';

// USR10 (T7): argumentos y mensajes de `npm run usuario:crear`.

describe('usuario:crear — argumentos', () => {
  it('lee --email, --nombre y --rol', () => {
    expect(parsearArgumentosUsuario(['--email', 'a@b.co', '--nombre', 'Dueño', '--rol', 'admin'])).toEqual({
      email: 'a@b.co',
      nombre: 'Dueño',
      rol: 'admin',
    });
  });

  it('exige los tres y un rol conocido', () => {
    expect(() => parsearArgumentosUsuario(['--email', 'a@b.co', '--nombre', 'X'])).toThrow(/--rol/);
    expect(() => parsearArgumentosUsuario(['--email', 'a@b.co', '--nombre', 'X', '--rol', 'dueno'])).toThrow(/admin\|asesor/);
    expect(() => parsearArgumentosUsuario(['--nombre', 'X', '--rol', 'admin'])).toThrow(/--email/);
  });

  it('nunca acepta la contraseña por argumento', () => {
    expect(() =>
      parsearArgumentosUsuario(['--email', 'a@b.co', '--nombre', 'X', '--rol', 'admin', '--contrasena', 'secreta-123456']),
    ).toThrow(/contraseña/);
  });
});

describe('usuario:crear — mensajes', () => {
  const argumentos = ['--email', 'a@b.co', '--nombre', 'Dueño', '--rol', 'admin'];

  it('un usuario creado informa su id y rol, nunca la contraseña ni el hash', async () => {
    const resultado = await ejecutarCrearUsuario(argumentos, {
      crear: { ejecutar: () => Promise.resolve({ creado: true, usuario: { id: 'id-1', nombre: 'Dueño', email: 'a@b.co', rol: 'admin' } }) },
      lector: new LectorContrasenaFalso([]),
    });

    expect(resultado).toEqual({ limpio: true, mensaje: 'usuario:crear: usuario creado (id id-1, rol admin).' });
  });

  it.each([
    ['sin-terminal', /terminal interactiva/],
    ['corta', /al menos 12/],
    ['larga', /200/],
    ['no-coincide', /no coinciden/],
    ['correo-repetido', /ya existe/],
    ['correo-invalido', /correo/],
    ['nombre-vacio', /nombre/],
  ] as const)('el motivo %s termina con error y lo dice', async (motivo, texto) => {
    const resultado = await ejecutarCrearUsuario(argumentos, {
      crear: { ejecutar: () => Promise.resolve({ creado: false, motivo }) },
      lector: new LectorContrasenaFalso([]),
    });

    expect(resultado.limpio).toBe(false);
    expect(resultado.mensaje).toMatch(texto);
  });
});
