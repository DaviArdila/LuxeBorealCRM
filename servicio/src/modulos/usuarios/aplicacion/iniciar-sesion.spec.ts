import { describe, expect, it } from 'vitest';
import { AlmacenSesionesEnMemoria } from '../../../../test/fakes/almacen-sesiones-en-memoria.js';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import { HasheadorContrasenaFalso } from '../../../../test/fakes/hasheador-contrasena-falso.js';
import { LimiteIntentosEnMemoria } from '../../../../test/fakes/limite-intentos-en-memoria.js';
import { RepositorioUsuarioEnMemoria } from '../../../../test/fakes/repositorio-usuario-en-memoria.js';
import type { Usuario } from '../dominio/usuario.js';
import { IniciarSesion } from './iniciar-sesion.js';

// Escenarios USR1 y USR8 de `openspec/specs/usuarios/spec.md` (T4).

const IP = '203.0.113.7';
const CONTRASENA = 'clave-correcta-del-dueno';
const ahora = new Date('2026-10-03T15:00:00Z');

function crearContexto(opciones: { readonly maximo?: number; readonly ventanaMin?: number } = {}) {
  const repositorio = new RepositorioUsuarioEnMemoria();
  const sesiones = new AlmacenSesionesEnMemoria();
  const hasheador = new HasheadorContrasenaFalso();
  const clock = new ClockFalso(ahora);
  const limite = new LimiteIntentosEnMemoria(clock, opciones.maximo ?? 5, opciones.ventanaMin ?? 15);
  const caso = new IniciarSesion(repositorio, sesiones, hasheador, limite, clock);
  return { repositorio, sesiones, hasheador, clock, limite, caso };
}

function sembrar(repositorio: RepositorioUsuarioEnMemoria, cambios: Partial<Usuario> = {}): Usuario {
  const usuario: Usuario = {
    id: '0199a000-0000-7000-8000-000000000001',
    email: 'admin@ejemplo.co',
    nombre: 'Dueño',
    passwordHash: `hash:${CONTRASENA}`,
    rol: 'admin',
    activo: true,
    ...cambios,
  };
  repositorio.usuarios.push(usuario);
  return usuario;
}

describe('IniciarSesion (USR1, USR8, D5, D6)', () => {
  it('USR1 — Credenciales válidas abren la sesión', async () => {
    const { repositorio, sesiones, caso } = crearContexto();
    const usuario = sembrar(repositorio);

    const resultado = await caso.ejecutar({ email: 'admin@ejemplo.co', contrasena: CONTRASENA, ip: IP });

    expect(resultado).toEqual({
      resultado: 'sesion-abierta',
      idSesion: 'sesion-1',
      usuario: { id: usuario.id, nombre: 'Dueño', email: 'admin@ejemplo.co', rol: 'admin' },
    });
    expect(JSON.stringify(resultado)).not.toContain('hash:');
    expect(sesiones.sesiones.get('sesion-1')).toEqual({ usuarioId: usuario.id, creada: ahora, ultimaActividad: ahora });
  });

  it('USR1 — El correo se compara sin distinguir mayúsculas', async () => {
    const { repositorio, caso } = crearContexto();
    sembrar(repositorio);

    const resultado = await caso.ejecutar({ email: 'Admin@Ejemplo.CO', contrasena: CONTRASENA, ip: IP });

    expect(resultado.resultado).toBe('sesion-abierta');
  });

  it('USR1 — Una contraseña incorrecta se rechaza sin decir por qué', async () => {
    const { repositorio, sesiones, caso } = crearContexto();
    sembrar(repositorio);

    const resultado = await caso.ejecutar({ email: 'admin@ejemplo.co', contrasena: 'otra-clave-cualquiera', ip: IP });

    expect(resultado).toEqual({ resultado: 'credenciales-invalidas' });
    expect(sesiones.sesiones.size).toBe(0);
  });

  it('USR1 — Un correo inexistente responde igual que una contraseña incorrecta', async () => {
    const { repositorio, hasheador, caso } = crearContexto();
    sembrar(repositorio);

    const inexistente = await caso.ejecutar({ email: 'nadie@ejemplo.co', contrasena: 'clave-de-prueba-123', ip: IP });
    const incorrecta = await caso.ejecutar({ email: 'admin@ejemplo.co', contrasena: 'clave-de-prueba-123', ip: IP });

    expect(inexistente).toEqual(incorrecta);
    expect(hasheador.verificacionesFicticias).toEqual(['clave-de-prueba-123']);
  });

  it('USR1 — Un usuario inactivo no inicia sesión', async () => {
    const { repositorio, sesiones, hasheador, caso } = crearContexto();
    sembrar(repositorio, { activo: false });

    const resultado = await caso.ejecutar({ email: 'admin@ejemplo.co', contrasena: CONTRASENA, ip: IP });

    expect(resultado).toEqual({ resultado: 'credenciales-invalidas' });
    expect(sesiones.sesiones.size).toBe(0);
    // Se verifica igual la contraseña: el tiempo no distingue a un usuario inactivo de uno activo.
    expect(hasheador.verificaciones).toEqual([CONTRASENA]);
  });

  it('USR1 — El último acceso se registra con el reloj inyectado', async () => {
    const { repositorio, caso } = crearContexto();
    const usuario = sembrar(repositorio);

    await caso.ejecutar({ email: 'admin@ejemplo.co', contrasena: CONTRASENA, ip: IP });

    expect(repositorio.accesos).toEqual([{ id: usuario.id, instante: new Date('2026-10-03T15:00:00Z') }]);
  });

  it('un inicio de sesión fallido no registra acceso', async () => {
    const { repositorio, caso } = crearContexto();
    sembrar(repositorio);

    await caso.ejecutar({ email: 'admin@ejemplo.co', contrasena: 'otra-clave-cualquiera', ip: IP });

    expect(repositorio.accesos).toEqual([]);
  });

  it('USR8 — El sexto intento fallido se bloquea', async () => {
    const { repositorio, sesiones, hasheador, clock, caso } = crearContexto({ maximo: 5 });
    sembrar(repositorio);
    for (let intento = 0; intento < 5; intento += 1) {
      await caso.ejecutar({ email: 'admin@ejemplo.co', contrasena: 'mala-mala-mala', ip: IP });
      clock.avanzar(2 * 60_000);
    }
    const verificacionesAntes = hasheador.verificaciones.length;

    const sexto = await caso.ejecutar({ email: 'admin@ejemplo.co', contrasena: CONTRASENA, ip: IP });

    expect(sexto.resultado).toBe('demasiados-intentos');
    if (sexto.resultado !== 'demasiados-intentos') return;
    expect(sexto.reintentarEnS).toBe(5 * 60);
    expect(sesiones.sesiones.size).toBe(0);
    expect(hasheador.verificaciones.length).toBe(verificacionesAntes);
    expect(hasheador.verificacionesFicticias).toEqual([]);
  });

  it('USR8 — Pasada la ventana se puede volver a intentar', async () => {
    const { repositorio, clock, caso } = crearContexto({ maximo: 5, ventanaMin: 15 });
    sembrar(repositorio);
    for (let intento = 0; intento < 6; intento += 1) {
      await caso.ejecutar({ email: 'admin@ejemplo.co', contrasena: 'mala-mala-mala', ip: IP });
    }

    clock.avanzar(15 * 60_000);
    const resultado = await caso.ejecutar({ email: 'admin@ejemplo.co', contrasena: CONTRASENA, ip: IP });

    expect(resultado.resultado).toBe('sesion-abierta');
  });

  it('USR8 — Un éxito reinicia el contador', async () => {
    const { repositorio, caso } = crearContexto({ maximo: 5 });
    sembrar(repositorio);
    const fallar = () => caso.ejecutar({ email: 'admin@ejemplo.co', contrasena: 'mala-mala-mala', ip: IP });
    for (let intento = 0; intento < 4; intento += 1) await fallar();
    expect((await caso.ejecutar({ email: 'admin@ejemplo.co', contrasena: CONTRASENA, ip: IP })).resultado).toBe(
      'sesion-abierta',
    );

    const despues = [];
    for (let intento = 0; intento < 4; intento += 1) despues.push((await fallar()).resultado);

    expect(despues).toEqual(Array(4).fill('credenciales-invalidas'));
  });

  it('el límite cuenta por el correo normalizado: cambiar mayúsculas no da intentos nuevos', async () => {
    const { repositorio, caso } = crearContexto({ maximo: 1 });
    sembrar(repositorio);
    await caso.ejecutar({ email: 'admin@ejemplo.co', contrasena: 'mala-mala-mala', ip: IP });

    const resultado = await caso.ejecutar({ email: 'ADMIN@ejemplo.co', contrasena: CONTRASENA, ip: IP });

    expect(resultado.resultado).toBe('demasiados-intentos');
  });
});
