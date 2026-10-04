import { describe, expect, it } from 'vitest';
import { AlmacenSesionesEnMemoria } from '../../../../test/fakes/almacen-sesiones-en-memoria.js';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import { RepositorioUsuarioEnMemoria } from '../../../../test/fakes/repositorio-usuario-en-memoria.js';
import type { Usuario } from '../dominio/usuario.js';
import { ObtenerSesionActual } from './obtener-sesion-actual.js';

// USR3 (duración máxima) y la lectura del usuario en cada petición (D2), T4.

const HORA_MS = 60 * 60 * 1000;
const ahora = new Date('2026-10-10T15:00:00Z');

const usuario: Usuario = {
  id: '0199a000-0000-7000-8000-000000000002',
  email: 'asesor@ejemplo.co',
  nombre: 'Asesora',
  passwordHash: 'hash:x',
  rol: 'asesor',
  activo: true,
};

function crearContexto(creadaHaceH: number) {
  const repositorio = new RepositorioUsuarioEnMemoria();
  repositorio.usuarios.push(usuario);
  const sesiones = new AlmacenSesionesEnMemoria();
  sesiones.sesiones.set('sesion-a', {
    usuarioId: usuario.id,
    creada: new Date(ahora.getTime() - creadaHaceH * HORA_MS),
    ultimaActividad: new Date(ahora.getTime() - 60_000),
  });
  const caso = new ObtenerSesionActual(repositorio, sesiones, new ClockFalso(ahora), { SESION_DURACION_MAX_H: 168 });
  return { repositorio, sesiones, caso };
}

describe('ObtenerSesionActual (USR3, USR5, D2)', () => {
  it('una sesión vigente devuelve el usuario leído de la base y renueva la última actividad', async () => {
    const { sesiones, caso } = crearContexto(1);

    const resultado = await caso.ejecutar('sesion-a');

    expect(resultado).toEqual({ id: usuario.id, nombre: 'Asesora', email: 'asesor@ejemplo.co', rol: 'asesor' });
    expect(sesiones.sesiones.get('sesion-a')?.ultimaActividad).toEqual(ahora);
  });

  it('USR3 — Una sesión vence al llegar a su duración máxima', async () => {
    const { sesiones, caso } = crearContexto(169);

    const resultado = await caso.ejecutar('sesion-a');

    expect(resultado).toBeNull();
    expect(sesiones.sesiones.has('sesion-a')).toBe(false);
  });

  it('sin id de sesión o con una sesión desconocida da null', async () => {
    const { caso } = crearContexto(1);

    expect(await caso.ejecutar(undefined)).toBeNull();
    expect(await caso.ejecutar('sesion-desconocida')).toBeNull();
  });

  it('un usuario desactivado o borrado invalida la sesión y la borra (D2)', async () => {
    const desactivado = crearContexto(1);
    desactivado.repositorio.modificar(usuario.id, { activo: false });
    const borrado = crearContexto(1);
    borrado.repositorio.usuarios.length = 0;

    expect(await desactivado.caso.ejecutar('sesion-a')).toBeNull();
    expect(desactivado.sesiones.sesiones.has('sesion-a')).toBe(false);
    expect(await borrado.caso.ejecutar('sesion-a')).toBeNull();
    expect(borrado.sesiones.sesiones.has('sesion-a')).toBe(false);
  });

  it('el rol sale de la base, no de la sesión: un cambio de rol se ve en la siguiente lectura', async () => {
    const { repositorio, caso } = crearContexto(1);
    repositorio.modificar(usuario.id, { rol: 'admin' });

    expect((await caso.ejecutar('sesion-a'))?.rol).toBe('admin');
  });
});
