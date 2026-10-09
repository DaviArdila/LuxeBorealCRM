import { Redis } from 'ioredis';
import { afterEach, describe, expect, it } from 'vitest';
import { MarcaAsesorAvisadoRedis } from '../../../src/modulos/conversaciones/infraestructura/redis/marca-asesor-avisado-redis.js';
import { prefijoRedisDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

/**
 * CNV14 y CNV15 contra Redis real (D3 de la Fase 12d): `SET NX` sobre el par conversación-motivo, TTL de respaldo,
 * liberación, limpieza y lectura. Las claves cuelgan de `COLAS_PREFIJO`, que cada worker de pruebas aísla.
 */

const abiertos: Redis[] = [];

afterEach(() => {
  for (const redis of abiertos.splice(0)) redis.disconnect();
});

function crear(): { marca: MarcaAsesorAvisadoRedis; redis: Redis; prefijo: string } {
  const redis = new Redis(urlRedisDePrueba(), { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 });
  abiertos.push(redis);
  const prefijo = `${prefijoRedisDePrueba()}colas-asesor-avisado`;
  return { marca: new MarcaAsesorAvisadoRedis(redis, { COLAS_PREFIJO: prefijo }), redis, prefijo };
}

describe('MarcaAsesorAvisadoRedis (CNV14, CNV15, integración)', () => {
  it('CNV14 — Dos turnos simultáneos con el mismo motivo avisan una sola vez', async () => {
    const { marca } = crear();
    const id = crypto.randomUUID();

    const resultados = await Promise.all([
      marca.adquirir(id, 'pide-persona'),
      marca.adquirir(id, 'pide-persona'),
      marca.adquirir(id, 'pide-persona'),
    ]);

    expect(resultados.filter(Boolean)).toHaveLength(1);
  });

  it('CNV14 — Un motivo distinto avisa aunque ya haya otro aviso', async () => {
    const { marca } = crear();
    const id = crypto.randomUUID();

    await expect(marca.adquirir(id, 'pide-persona')).resolves.toBe(true);
    await expect(marca.adquirir(id, 'lead-caliente')).resolves.toBe(true);
    await expect(marca.adquirir(id, 'audio-repetido')).resolves.toBe(true);
  });

  it('CNV14 — Las marcas de otra conversación no se mezclan', async () => {
    const { marca } = crear();

    await expect(marca.adquirir(crypto.randomUUID(), 'pide-persona')).resolves.toBe(true);
    await expect(marca.adquirir(crypto.randomUUID(), 'pide-persona')).resolves.toBe(true);
  });

  it('CNV14 — Liberar la marca de un motivo permite adquirirla de nuevo', async () => {
    const { marca } = crear();
    const id = crypto.randomUUID();
    await marca.adquirir(id, 'audio-repetido');

    await marca.liberar(id, 'audio-repetido');

    await expect(marca.adquirir(id, 'audio-repetido')).resolves.toBe(true);
  });

  it('CNV14 — El eco humano borra las marcas de todos los motivos', async () => {
    const { marca } = crear();
    const id = crypto.randomUUID();
    await marca.adquirir(id, 'pide-persona');
    await marca.adquirir(id, 'audio-repetido');

    await marca.limpiar(id);

    expect(await marca.estaAvisado(id)).toBe(false);
    await expect(marca.adquirir(id, 'pide-persona')).resolves.toBe(true);
    await expect(marca.adquirir(id, 'audio-repetido')).resolves.toBe(true);
  });

  it('CNV14 — La marca vence sola con un TTL de respaldo', async () => {
    const { marca, redis, prefijo } = crear();
    const id = crypto.randomUUID();
    await marca.adquirir(id, 'lead-caliente');

    const ttl = await redis.ttl(`${prefijo}:asesor-avisado:${id}:lead-caliente`);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(24 * 3600);
  });

  it('CNV14 — La marca de aviso no guarda el contenido', async () => {
    const { marca, redis, prefijo } = crear();
    const id = crypto.randomUUID();
    await marca.adquirir(id, 'pide-persona');

    const claves = await redis.keys(`${prefijo}:asesor-avisado:${id}:*`);

    expect(claves).toEqual([`${prefijo}:asesor-avisado:${id}:pide-persona`]);
    expect(await redis.get(claves[0] ?? '')).toBe('1');
  });

  it('CNV15 — El puerto responde que el asesor ya fue avisado, de cualquier motivo', async () => {
    const { marca } = crear();
    const id = crypto.randomUUID();
    await marca.adquirir(id, 'audio-repetido');

    await expect(marca.estaAvisado(id)).resolves.toBe(true);
  });

  it('CNV15 — Sin marca el puerto responde que no', async () => {
    const { marca } = crear();

    await expect(marca.estaAvisado(crypto.randomUUID())).resolves.toBe(false);
  });
});
