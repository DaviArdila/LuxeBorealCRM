import { describe, expect, it } from 'vitest';
import { opcionesConexionColas } from './opciones-conexion.js';

describe('opcionesConexionColas (T4, D6)', () => {
  it('siempre fuerza maxRetriesPerRequest a null (BullMQ lo exige para sus workers)', () => {
    const opciones = opcionesConexionColas('redis://localhost:6380');

    expect(opciones.maxRetriesPerRequest).toBeNull();
  });

  it('extrae host y puerto de una URL redis:// simple', () => {
    const opciones = opcionesConexionColas('redis://localhost:6380');

    expect(opciones.host).toBe('localhost');
    expect(opciones.port).toBe(6380);
    expect(opciones.tls).toBeUndefined();
  });

  it('usa el puerto 6379 por defecto cuando la URL no trae puerto', () => {
    const opciones = opcionesConexionColas('redis://localhost');

    expect(opciones.port).toBe(6379);
  });

  it('extrae usuario y contraseña cuando vienen en la URL', () => {
    const opciones = opcionesConexionColas('redis://usuario:clave-secreta@localhost:6380');

    expect(opciones.username).toBe('usuario');
    expect(opciones.password).toBe('clave-secreta');
  });

  it('decodifica usuario y contraseña con caracteres especiales (percent-encoding)', () => {
    const opciones = opcionesConexionColas('redis://usuario:clave%20con%20espacios@localhost:6380');

    expect(opciones.password).toBe('clave con espacios');
  });

  it('activa tls cuando el esquema es rediss://', () => {
    const opciones = opcionesConexionColas('rediss://localhost:6380');

    expect(opciones.tls).toEqual({});
  });

  it('extrae el índice de base de datos del pathname cuando viene', () => {
    const opciones = opcionesConexionColas('redis://localhost:6380/2');

    expect(opciones.db).toBe(2);
  });

  it('no fija db cuando la URL no trae pathname', () => {
    const opciones = opcionesConexionColas('redis://localhost:6380');

    expect(opciones.db).toBeUndefined();
  });
});
