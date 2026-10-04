import type { obtenerSesionActual } from '../api/fn/auth/obtener-sesion-actual';
import type { Rol } from './definicion-area';
import type { RespuestaDe } from './tipos';

type Usuario = RespuestaDe<typeof obtenerSesionActual>;

describe('D13 — RespuestaDe saca el tipo del cuerpo de la respuesta del cliente generado', () => {
  it('un usuario con el rol del contrato compila y uno con otro rol no', () => {
    const valido: Usuario = { id: 'u1', email: 'a@b.co', nombre: 'Ana', rol: 'admin' };
    // @ts-expect-error — 'supervisor' no es un rol del contrato
    const invalido: Usuario = { id: 'u1', email: 'a@b.co', nombre: 'Ana', rol: 'supervisor' };

    expect([valido.rol, invalido.nombre]).toEqual(['admin', 'Ana']);
  });

  it('Rol es la unión de roles del contrato', () => {
    const roles: Rol[] = ['admin', 'asesor'];

    expect(roles).toHaveLength(2);
  });
});
