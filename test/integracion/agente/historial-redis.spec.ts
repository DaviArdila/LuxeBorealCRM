import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { HistorialRedis } from '../../../src/modulos/agente/infraestructura/redis/historial-redis.js';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { REDIS_CLIENTE, RedisModule, type ClienteRedis } from '../../../src/plataforma/redis/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

// T3 (fase-07b): historial corto por sesión contra Redis real (D3, ADR-0017): recorte, TTL y sesiones.

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearContexto(turnos = 6, ttlHoras = 168) {
  const configuracion = cargarConfiguracion({
    NODE_ENV: 'test',
    DATABASE_URL: urlPostgresDePrueba(),
    REDIS_URL: urlRedisDePrueba(),
    AGENTE_HISTORIAL_TURNOS: String(turnos),
    AGENTE_SESION_TTL_H: String(ttlHoras),
  });
  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, RedisModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracion)
    .compile();
  const redis = modulo.get<ClienteRedis>(REDIS_CLIENTE);
  if (redis.status === 'wait') await redis.connect();
  return { historial: new HistorialRedis(redis, configuracion), redis };
}

describe('HistorialRedis (T3, integración, D3)', () => {
  it('lee en orden cronológico los últimos turnos de la sesión', async () => {
    const { historial } = await crearContexto();
    const sesion = { conversacionId: crypto.randomUUID(), version: 0 };
    await historial.agregar(sesion, 'uno', 'bot uno');
    await historial.agregar(sesion, 'dos', 'bot dos');
    await historial.agregar(sesion, 'tres', 'bot tres');

    await expect(historial.leer(sesion, 2)).resolves.toEqual([
      { rol: 'usuario', texto: 'dos' },
      { rol: 'asistente', texto: 'bot dos' },
      { rol: 'usuario', texto: 'tres' },
      { rol: 'asistente', texto: 'bot tres' },
    ]);
  });

  it('recorta la lista a 2 × AGENTE_HISTORIAL_TURNOS y renueva el TTL', async () => {
    const { historial, redis } = await crearContexto(2, 2);
    const sesion = { conversacionId: crypto.randomUUID(), version: 3 };
    for (let i = 1; i <= 5; i += 1) {
      await historial.agregar(sesion, `c${String(i)}`, `b${String(i)}`);
    }

    const clave = `agente:${sesion.conversacionId}:v3:historial`;
    expect(await redis.llen(clave)).toBe(4);
    const ttl = await redis.ttl(clave);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(2 * 3600);
    const leidos = await historial.leer(sesion, 6);
    expect(leidos.map((turno) => turno.texto)).toEqual(['c4', 'b4', 'c5', 'b5']);
  });

  it('una versión distinta de la misma conversación es otra sesión', async () => {
    const { historial } = await crearContexto();
    const conversacionId = crypto.randomUUID();
    await historial.agregar({ conversacionId, version: 0 }, 'viejo', 'viejo bot');

    await expect(historial.leer({ conversacionId, version: 1 }, 6)).resolves.toEqual([]);
  });

  it('con AGENTE_HISTORIAL_TURNOS = 0 no guarda ni entrega nada', async () => {
    const { historial, redis } = await crearContexto(0);
    const sesion = { conversacionId: crypto.randomUUID(), version: 0 };

    await historial.agregar(sesion, 'hola', 'hola bot');

    expect(await redis.exists(`agente:${sesion.conversacionId}:v0:historial`)).toBe(0);
    await expect(historial.leer(sesion, 6)).resolves.toEqual([]);
  });

  it('descarta una entrada ilegible sin fallar', async () => {
    const { historial, redis } = await crearContexto();
    const sesion = { conversacionId: crypto.randomUUID(), version: 0 };
    await redis.rpush(`agente:${sesion.conversacionId}:v0:historial`, 'no es json', '{"rol":"otro","texto":1}');
    await historial.agregar(sesion, 'hola', 'hola bot');

    await expect(historial.leer(sesion, 6)).resolves.toEqual([
      { rol: 'usuario', texto: 'hola' },
      { rol: 'asistente', texto: 'hola bot' },
    ]);
  });
});
