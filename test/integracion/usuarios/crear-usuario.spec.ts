import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { CrearUsuario, UsuariosModule } from '../../../src/modulos/usuarios/index.js';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { PrismaService } from '../../../src/plataforma/prisma/index.js';
import { RelojModule } from '../../../src/plataforma/reloj/index.js';
import { LectorContrasenaFalso } from '../../fakes/lector-contrasena-falso.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

// T7 (fase-11a): `CrearUsuario` con Postgres real y argon2id real, como lo usa `npm run usuario:crear` (USR10).

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearContexto() {
  const configuracion = cargarConfiguracion({ NODE_ENV: 'test', DATABASE_URL: urlPostgresDePrueba(), REDIS_URL: urlRedisDePrueba() });
  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, RelojModule, UsuariosModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracion)
    .compile();
  return { caso: modulo.get(CrearUsuario), prisma: modulo.get(PrismaService) };
}

describe('CrearUsuario (T7, integración)', () => {
  it('USR10 — Crear el primer administrador', async () => {
    const { caso, prisma } = await crearContexto();
    const local = `admin-${randomUUID()}`;
    const contrasena = 'dieciseis-chars!';

    const resultado = await caso.ejecutar(
      { email: `${local.toUpperCase()}@Ejemplo.co`, nombre: 'Dueño', rol: 'admin' },
      new LectorContrasenaFalso([contrasena, contrasena]),
    );

    expect(resultado.creado).toBe(true);
    const fila = await prisma.usuario.findUniqueOrThrow({ where: { email: `${local}@ejemplo.co` } });
    expect(fila).toMatchObject({ nombre: 'Dueño', rol: 'admin', activo: true });
    expect(fila.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(fila.passwordHash).not.toContain(contrasena);
  });

  it('un correo repetido en la base no modifica la fila existente', async () => {
    const { caso, prisma } = await crearContexto();
    const email = `persona-${randomUUID()}@ejemplo.co`;
    await prisma.usuario.create({ data: { email, nombre: 'Original', passwordHash: 'hash-original', rol: 'asesor' } });

    const resultado = await caso.ejecutar(
      { email, nombre: 'Otro', rol: 'admin' },
      new LectorContrasenaFalso(['dieciseis-chars!', 'dieciseis-chars!']),
    );

    expect(resultado).toEqual({ creado: false, motivo: 'correo-repetido' });
    expect(await prisma.usuario.findUniqueOrThrow({ where: { email } })).toMatchObject({
      nombre: 'Original',
      passwordHash: 'hash-original',
      rol: 'asesor',
    });
  });
});
