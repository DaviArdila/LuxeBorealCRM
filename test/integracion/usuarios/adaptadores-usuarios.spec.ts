import { createHash, randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { AlmacenSesionesRedis } from '../../../src/modulos/usuarios/infraestructura/redis/almacen-sesiones-redis.js';
import { LimiteIntentosRedis } from '../../../src/modulos/usuarios/infraestructura/redis/limite-intentos-redis.js';
import { RepositorioUsuarioPrisma } from '../../../src/modulos/usuarios/infraestructura/prisma/repositorio-usuario-prisma.js';
import { HasheadorArgon2 } from '../../../src/modulos/usuarios/infraestructura/hasheador-argon2.js';
import {
  CONFIGURACION,
  ConfiguracionModule,
  cargarConfiguracion,
  type Configuracion,
} from '../../../src/plataforma/config/index.js';
import { PrismaModule, PrismaService } from '../../../src/plataforma/prisma/index.js';
import { REDIS_CLIENTE, RedisModule, type ClienteRedis } from '../../../src/plataforma/redis/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

// T3 (fase-11a): adaptadores de `usuarios` contra Postgres y Redis reales (USR3, USR8, D1, D5, D6).

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearContexto(variables: Readonly<Record<string, string>> = {}) {
  const configuracion: Configuracion = cargarConfiguracion({
    NODE_ENV: 'test',
    DATABASE_URL: urlPostgresDePrueba(),
    REDIS_URL: urlRedisDePrueba(),
    ...variables,
  });
  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, PrismaModule, RedisModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracion)
    .compile();
  const prisma = modulo.get(PrismaService);
  const redis = modulo.get<ClienteRedis>(REDIS_CLIENTE);
  return {
    prisma,
    redis,
    repositorio: new RepositorioUsuarioPrisma(prisma),
    sesiones: new AlmacenSesionesRedis(redis, configuracion),
    limite: new LimiteIntentosRedis(redis, configuracion),
  };
}

function correoUnico(): string {
  return `persona-${randomUUID()}@ejemplo.co`;
}

const instante = new Date('2026-10-03T15:00:00.000Z');

describe('RepositorioUsuarioPrisma (T3, integración)', () => {
  it('crea un usuario activo y lo encuentra por correo (sin distinguir mayúsculas) y por id', async () => {
    const { repositorio } = await crearContexto();
    const email = correoUnico();

    const resultado = await repositorio.crear({ email, nombre: 'Dueño', passwordHash: '$argon2id$falso', rol: 'admin' });

    expect(resultado.creado).toBe(true);
    if (!resultado.creado) return;
    expect(resultado.usuario).toMatchObject({ email, nombre: 'Dueño', rol: 'admin', activo: true });
    expect(await repositorio.buscarPorEmail(email.toUpperCase())).toEqual(resultado.usuario);
    expect(await repositorio.buscarPorId(resultado.usuario.id)).toEqual(resultado.usuario);
  });

  it('un correo inexistente o un id inexistente dan null', async () => {
    const { repositorio } = await crearContexto();

    expect(await repositorio.buscarPorEmail(correoUnico())).toBeNull();
    expect(await repositorio.buscarPorId(randomUUID())).toBeNull();
  });

  it('un correo repetido no pisa al usuario existente', async () => {
    const { repositorio, prisma } = await crearContexto();
    const email = correoUnico();
    await repositorio.crear({ email, nombre: 'Original', passwordHash: 'hash-original', rol: 'admin' });

    const repetido = await repositorio.crear({ email, nombre: 'Otro', passwordHash: 'hash-otro', rol: 'asesor' });

    expect(repetido).toEqual({ creado: false, motivo: 'correo-repetido' });
    const fila = await prisma.usuario.findUniqueOrThrow({ where: { email } });
    expect(fila).toMatchObject({ nombre: 'Original', passwordHash: 'hash-original', rol: 'admin' });
  });

  it('registrarAcceso escribe ultimo_acceso y actualizado con el instante recibido', async () => {
    const { repositorio, prisma } = await crearContexto();
    const resultado = await repositorio.crear({ email: correoUnico(), nombre: 'A', passwordHash: 'h', rol: 'asesor' });
    if (!resultado.creado) throw new Error('no se creó el usuario de prueba');

    await repositorio.registrarAcceso(resultado.usuario.id, instante);

    const fila = await prisma.usuario.findUniqueOrThrow({ where: { id: resultado.usuario.id } });
    expect(fila.ultimoAcceso).toEqual(instante);
    expect(fila.actualizado).toEqual(instante);
  });
});

describe('AlmacenSesionesRedis (T3, integración)', () => {
  it('USR3 — La sesión no guarda datos personales', async () => {
    const { sesiones, redis } = await crearContexto();
    const usuarioId = randomUUID();

    const id = await sesiones.crear({ usuarioId, creada: instante, ultimaActividad: instante });

    const crudo = await redis.get(`sesion:${id}`);
    expect(JSON.parse(crudo ?? 'null')).toEqual({
      usuarioId,
      creada: instante.toISOString(),
      ultimaActividad: instante.toISOString(),
    });
    expect(crudo).not.toMatch(/@|contrasena|password|email|correo/i);
  });

  it('crea la clave con el TTL de inactividad configurado', async () => {
    const { sesiones, redis } = await crearContexto({ SESION_INACTIVIDAD_MIN: '30', SESION_DURACION_MAX_H: '1' });

    const id = await sesiones.crear({ usuarioId: randomUUID(), creada: instante, ultimaActividad: instante });

    const ttl = await redis.ttl(`sesion:${id}`);
    expect(ttl).toBeGreaterThan(30 * 60 - 5);
    expect(ttl).toBeLessThanOrEqual(30 * 60);
  });

  it('leerYRenovar devuelve la sesión, actualiza la última actividad y vuelve a dar el TTL completo', async () => {
    const { sesiones, redis } = await crearContexto();
    const usuarioId = randomUUID();
    const id = await sesiones.crear({ usuarioId, creada: instante, ultimaActividad: instante });
    await redis.expire(`sesion:${id}`, 60);
    const despues = new Date(instante.getTime() + 700 * 60 * 1000);

    const sesion = await sesiones.leerYRenovar(id, despues);

    expect(sesion).toEqual({ usuarioId, creada: instante, ultimaActividad: despues });
    expect(await redis.ttl(`sesion:${id}`)).toBeGreaterThan(720 * 60 - 5);
  });

  it('una sesión vencida por TTL ya no se lee', async () => {
    const { sesiones, redis } = await crearContexto();
    const id = await sesiones.crear({ usuarioId: randomUUID(), creada: instante, ultimaActividad: instante });
    await redis.pexpire(`sesion:${id}`, 1);
    await new Promise((resolver) => setTimeout(resolver, 20));

    expect(await sesiones.leerYRenovar(id, instante)).toBeNull();
  });

  it('borrar elimina la clave y la sesión ya no se lee ni se resucita', async () => {
    const { sesiones, redis } = await crearContexto();
    const id = await sesiones.crear({ usuarioId: randomUUID(), creada: instante, ultimaActividad: instante });

    await sesiones.borrar(id);

    expect(await redis.exists(`sesion:${id}`)).toBe(0);
    expect(await sesiones.leerYRenovar(id, instante)).toBeNull();
    expect(await redis.exists(`sesion:${id}`)).toBe(0);
  });

  it('un id con formato distinto de 43 caracteres base64url no consulta nada y da null', async () => {
    const { sesiones } = await crearContexto();

    expect(await sesiones.leerYRenovar('*', instante)).toBeNull();
    expect(await sesiones.leerYRenovar('a'.repeat(44), instante)).toBeNull();
  });
});

describe('LimiteIntentosRedis (T3, integración)', () => {
  it('USR8 — El contador no guarda el correo en claro', async () => {
    const { limite, redis } = await crearContexto();
    const email = correoUnico();

    await limite.consumirIntento(email, '203.0.113.7');

    const huella = createHash('sha256').update(email).digest('hex');
    const claves = await redis.keys('auth:intentos:*');
    expect(claves).toContain(`auth:intentos:${huella}:203.0.113.7`);
    expect(claves.some((clave) => clave.includes(email))).toBe(false);
  });

  it('permite AUTH_INTENTOS_MAX intentos y bloquea el siguiente con los segundos que faltan', async () => {
    const { limite } = await crearContexto({ AUTH_INTENTOS_MAX: '3', AUTH_VENTANA_MIN: '15' });
    const email = correoUnico();

    const permitidos = [];
    for (let intento = 0; intento < 3; intento += 1) {
      permitidos.push(await limite.consumirIntento(email, '203.0.113.7'));
    }
    const cuarto = await limite.consumirIntento(email, '203.0.113.7');

    expect(permitidos).toEqual([{ permitido: true }, { permitido: true }, { permitido: true }]);
    expect(cuarto.permitido).toBe(false);
    if (cuarto.permitido) return;
    expect(cuarto.reintentarEnS).toBeGreaterThan(15 * 60 - 5);
    expect(cuarto.reintentarEnS).toBeLessThanOrEqual(15 * 60);
  });

  it('intentos concurrentes no superan el máximo (sin carrera entre consultar y contar)', async () => {
    const { limite } = await crearContexto({ AUTH_INTENTOS_MAX: '5' });
    const email = correoUnico();

    const resultados = await Promise.all(
      Array.from({ length: 12 }, () => limite.consumirIntento(email, '203.0.113.7')),
    );

    expect(resultados.filter((resultado) => resultado.permitido)).toHaveLength(5);
  });

  it('el bloqueo no afecta a la misma cuenta desde otra IP', async () => {
    const { limite } = await crearContexto({ AUTH_INTENTOS_MAX: '1' });
    const email = correoUnico();
    await limite.consumirIntento(email, '203.0.113.7');

    expect((await limite.consumirIntento(email, '203.0.113.7')).permitido).toBe(false);
    expect(await limite.consumirIntento(email, '198.51.100.4')).toEqual({ permitido: true });
  });

  it('el bloqueo vence con la ventana: la clave tiene el TTL de AUTH_VENTANA_MIN y no se alarga', async () => {
    const { limite, redis } = await crearContexto({ AUTH_INTENTOS_MAX: '1', AUTH_VENTANA_MIN: '2' });
    const email = correoUnico();
    const clave = `auth:intentos:${createHash('sha256').update(email).digest('hex')}:203.0.113.7`;
    await limite.consumirIntento(email, '203.0.113.7');
    await redis.expire(clave, 30);

    await limite.consumirIntento(email, '203.0.113.7');

    expect(await redis.ttl(clave)).toBeLessThanOrEqual(30);
  });

  it('reiniciar borra el contador de la pareja', async () => {
    const { limite } = await crearContexto({ AUTH_INTENTOS_MAX: '1' });
    const email = correoUnico();
    await limite.consumirIntento(email, '203.0.113.7');

    await limite.reiniciar(email, '203.0.113.7');

    expect(await limite.consumirIntento(email, '203.0.113.7')).toEqual({ permitido: true });
  });
});

describe('HasheadorArgon2 (T3, integración)', () => {
  it('hashea con argon2id y los parámetros de OWASP, y verifica solo la contraseña correcta', async () => {
    const hasheador = new HasheadorArgon2();

    const hash = await hasheador.hashear('una-contrasena-larga');

    expect(hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(await hasheador.verificar(hash, 'una-contrasena-larga')).toBe(true);
    expect(await hasheador.verificar(hash, 'otra-contrasena-larga')).toBe(false);
  });

  it('un hash malformado se trata como contraseña incorrecta, sin lanzar', async () => {
    const hasheador = new HasheadorArgon2();

    expect(await hasheador.verificar('no-es-un-hash', 'lo-que-sea')).toBe(false);
  });

  it('verificarFicticio corre una verificación argon2id completa contra el hash ficticio del arranque (D6)', async () => {
    const hasheador = new HasheadorArgon2();
    await hasheador.onModuleInit();

    const inicio = performance.now();
    await hasheador.verificarFicticio('cualquier-cosa');
    const duracion = performance.now() - inicio;

    expect(duracion).toBeGreaterThan(1);
  });
});
