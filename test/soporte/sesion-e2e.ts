import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { HasheadorArgon2 } from '../../src/modulos/usuarios/infraestructura/hasheador-argon2.js';
import type { PrismaService } from '../../src/plataforma/prisma/index.js';

/** Contraseña de los usuarios que crean los e2e: solo existe en la base de prueba. */
export const CONTRASENA_E2E = 'contrasena-del-e2e-123';

export interface SesionDePrueba {
  readonly usuarioId: string;
  readonly email: string;
  /** Valor listo para el encabezado `Cookie` de una petición. */
  readonly cookie: string;
}

/**
 * Crea un usuario en la base y abre su sesión por `POST /api/v1/auth/sesion`, como lo haría el cliente (USR1): así los
 * e2e de cada área ejercitan las guardias reales de la 11a, sin atajos hacia Redis.
 */
export async function iniciarSesionComo(
  servidor: Server,
  prisma: PrismaService,
  rol: 'admin' | 'asesor',
): Promise<SesionDePrueba> {
  const email = `persona-${randomUUID()}@ejemplo.co`;
  const usuario = await prisma.usuario.create({
    data: { email, nombre: 'Persona del e2e', passwordHash: await new HasheadorArgon2().hashear(CONTRASENA_E2E), rol },
  });
  const respuesta = await request(servidor)
    .post('/api/v1/auth/sesion')
    .set('x-luxe-csrf', '1')
    .send({ email, contrasena: CONTRASENA_E2E });
  const setCookie = respuesta.headers['set-cookie'];
  const cookie = (Array.isArray(setCookie) ? (setCookie as string[]) : []).find((linea) => linea.startsWith('luxe_sesion='));
  if (respuesta.status !== 200 || cookie === undefined) {
    throw new Error(`no se pudo iniciar sesión como ${rol}: estado ${String(respuesta.status)}`);
  }
  return { usuarioId: usuario.id, email, cookie: cookie.split(';')[0] ?? '' };
}
