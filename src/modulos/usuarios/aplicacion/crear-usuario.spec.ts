import { describe, expect, it } from 'vitest';
import { HasheadorContrasenaFalso } from '../../../../test/fakes/hasheador-contrasena-falso.js';
import { LectorContrasenaFalso } from '../../../../test/fakes/lector-contrasena-falso.js';
import { RepositorioUsuarioEnMemoria } from '../../../../test/fakes/repositorio-usuario-en-memoria.js';
import { CrearUsuario } from './crear-usuario.js';

// USR10 (T7): la regla del comando `usuario:crear`, sin terminal ni base.

const CONTRASENA = 'una-clave-de-16!';

function crearContexto() {
  const repositorio = new RepositorioUsuarioEnMemoria();
  const caso = new CrearUsuario(repositorio, new HasheadorContrasenaFalso());
  return { repositorio, caso };
}

const datos = { email: 'Admin@Ejemplo.co', nombre: 'Dueño', rol: 'admin' } as const;

describe('CrearUsuario (USR10, D7)', () => {
  it('crea el usuario con el correo en minúsculas y solo el hash de la contraseña', async () => {
    const { repositorio, caso } = crearContexto();

    const resultado = await caso.ejecutar(datos, new LectorContrasenaFalso([CONTRASENA, CONTRASENA]));

    expect(resultado.creado).toBe(true);
    expect(repositorio.usuarios).toEqual([
      expect.objectContaining({ email: 'admin@ejemplo.co', nombre: 'Dueño', rol: 'admin', passwordHash: `hash:${CONTRASENA}` }),
    ]);
    expect(JSON.stringify(resultado)).not.toContain(CONTRASENA);
  });

  it('USR10 — Una contraseña corta o que no coincide se rechaza', async () => {
    const corta = crearContexto();
    const distinta = crearContexto();

    const porCorta = await corta.caso.ejecutar(datos, new LectorContrasenaFalso(['clave-8c', 'clave-8c']));
    const porDistinta = await distinta.caso.ejecutar(datos, new LectorContrasenaFalso([CONTRASENA, `${CONTRASENA}x`]));

    expect(porCorta).toEqual({ creado: false, motivo: 'corta' });
    expect(porDistinta).toEqual({ creado: false, motivo: 'no-coincide' });
    expect(corta.repositorio.usuarios).toEqual([]);
    expect(distinta.repositorio.usuarios).toEqual([]);
  });

  it('USR10 — Un correo repetido no pisa al usuario existente', async () => {
    const { repositorio, caso } = crearContexto();
    await caso.ejecutar(datos, new LectorContrasenaFalso([CONTRASENA, CONTRASENA]));
    const lector = new LectorContrasenaFalso([]);

    const resultado = await caso.ejecutar({ email: 'ADMIN@ejemplo.co', nombre: 'Otro', rol: 'asesor' }, lector);

    expect(resultado).toEqual({ creado: false, motivo: 'correo-repetido' });
    expect(repositorio.usuarios).toHaveLength(1);
    expect(repositorio.usuarios[0]).toMatchObject({ nombre: 'Dueño', rol: 'admin', passwordHash: `hash:${CONTRASENA}` });
    // El correo repetido se detecta antes de pedir la contraseña.
    expect(lector.lecturas).toBe(0);
  });

  it('USR10 — Sin terminal interactiva el comando no corre', async () => {
    const { repositorio, caso } = crearContexto();
    const lector = new LectorContrasenaFalso([CONTRASENA, CONTRASENA], false);

    const resultado = await caso.ejecutar(datos, lector);

    expect(resultado).toEqual({ creado: false, motivo: 'sin-terminal' });
    expect(lector.lecturas).toBe(0);
    expect(repositorio.usuarios).toEqual([]);
  });

  it('rechaza un correo sin formato válido o un nombre vacío sin pedir la contraseña', async () => {
    const { caso } = crearContexto();
    const lector = new LectorContrasenaFalso([]);

    expect(await caso.ejecutar({ ...datos, email: 'no-es-correo' }, lector)).toEqual({ creado: false, motivo: 'correo-invalido' });
    expect(await caso.ejecutar({ ...datos, nombre: '   ' }, lector)).toEqual({ creado: false, motivo: 'nombre-vacio' });
    expect(lector.lecturas).toBe(0);
  });
});
