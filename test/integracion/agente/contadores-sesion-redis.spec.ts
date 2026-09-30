import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ContadoresSesionRedis } from '../../../src/modulos/agente/infraestructura/redis/contadores-sesion-redis.js';
import { CONFIGURACION, ConfiguracionModule, cargarConfiguracion } from '../../../src/plataforma/config/index.js';
import { REDIS_CLIENTE, RedisModule, type ClienteRedis } from '../../../src/plataforma/redis/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

// T5 (fase-07a): contadores de sesión del agente contra Redis real (D8): claves por versión y TTL.

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearContexto(ttlHoras = 168) {
  const configuracion = cargarConfiguracion({
    NODE_ENV: 'test',
    DATABASE_URL: urlPostgresDePrueba(),
    REDIS_URL: urlRedisDePrueba(),
    AGENTE_SESION_TTL_H: String(ttlHoras),
  });
  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, RedisModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracion)
    .compile();
  const redis = modulo.get<ClienteRedis>(REDIS_CLIENTE);
  if (redis.status === 'wait') await redis.connect();
  return { contadores: new ContadoresSesionRedis(redis, configuracion), redis };
}

describe('ContadoresSesionRedis (T5, integración, D8)', () => {
  it('cuenta audios y turnos por sesión y los reinicia sin mezclar sesiones', async () => {
    const { contadores } = await crearContexto();
    const sesion = { conversacionId: crypto.randomUUID(), version: 4 };
    const otraVersion = { ...sesion, version: 5 };

    expect(await contadores.sumarAudio(sesion)).toBe(1);
    expect(await contadores.sumarAudio(sesion)).toBe(2);
    expect(await contadores.sumarAudio(otraVersion)).toBe(1);
    await contadores.reiniciarAudios(sesion);
    expect(await contadores.sumarAudio(sesion)).toBe(1);

    expect(await contadores.turnos(sesion)).toBe(0);
    await contadores.registrarTurno(sesion);
    await contadores.registrarTurno(sesion);
    expect(await contadores.turnos(sesion)).toBe(2);
    expect(await contadores.turnos(otraVersion)).toBe(0);
  });

  it('las claves llevan el prefijo del módulo, la versión y AGENTE_SESION_TTL_H como TTL', async () => {
    const { contadores, redis } = await crearContexto(2);
    const sesion = { conversacionId: crypto.randomUUID(), version: 7 };

    await contadores.sumarAudio(sesion);
    await contadores.registrarTurno(sesion);

    const base = `agente:${sesion.conversacionId}:v7`;
    for (const clave of [`${base}:audios`, `${base}:turnos`]) {
      const ttl = await redis.ttl(clave);
      expect(ttl).toBeGreaterThan(2 * 3600 - 60);
      expect(ttl).toBeLessThanOrEqual(2 * 3600);
    }
  });

  it('AGT9 — cuenta las fotos individuales de la sesión con TTL y sin mezclar versiones', async () => {
    const { contadores, redis } = await crearContexto(2);
    const sesion = { conversacionId: crypto.randomUUID(), version: 1 };

    expect(await contadores.fotosIndividuales(sesion)).toBe(0);
    await contadores.sumarFotosIndividuales(sesion, 3);
    await contadores.sumarFotosIndividuales(sesion, 1);

    expect(await contadores.fotosIndividuales(sesion)).toBe(4);
    expect(await contadores.fotosIndividuales({ ...sesion, version: 2 })).toBe(0);
    const ttl = await redis.ttl(`agente:${sesion.conversacionId}:v1:fotos`);
    expect(ttl).toBeGreaterThan(2 * 3600 - 60);
    expect(ttl).toBeLessThanOrEqual(2 * 3600);
  });
});
