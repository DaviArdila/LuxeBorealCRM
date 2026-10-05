import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { VersionEstiloRedis } from '../../../src/modulos/agente/infraestructura/redis/version-estilo-redis.js';
import { BufferTurno } from '../../../src/modulos/conversaciones/infraestructura/redis/buffer-turno.js';
import { MarcaMensajeProcesado } from '../../../src/modulos/conversaciones/infraestructura/redis/marca-mensaje-procesado.js';
import { CONFIGURACION, ConfiguracionModule, type Configuracion } from '../../../src/plataforma/config/index.js';
import { REDIS_CLIENTE, RedisModule, type ClienteRedis } from '../../../src/plataforma/redis/index.js';
import { urlRedisDePrueba } from '../../soporte/infraestructura.js';

/**
 * Regresión de la carrera en la conexión perezosa (`odd/tasks/conexion-redis-perezosa.md`, T1): con
 * `lazyConnect: true` y `enableOfflineQueue: false`, el primer adaptador que usa el cliente llama a
 * `connect()` y deja el estado en `connecting`; un segundo adaptador que llega en ese momento no debe
 * emitir su comando antes del `ready`, o ioredis lo rechaza con "Stream isn't writeable and
 * enableOfflineQueue options is false". El cliente sale del `RedisModule` real para usar sus mismas
 * opciones de conexión.
 */

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function clienteRecienCreado(): Promise<ClienteRedis> {
  // `RedisModule` solo lee `REDIS_URL` de la configuración.
  const configuracion = { REDIS_URL: urlRedisDePrueba() } as Configuracion;
  modulo = await Test.createTestingModule({ imports: [ConfiguracionModule, RedisModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracion)
    .compile();
  return modulo.get<ClienteRedis>(REDIS_CLIENTE);
}

describe('Conexión perezosa compartida entre adaptadores Redis', () => {
  it('dos adaptadores distintos usan en paralelo un cliente sin conectar y ambos responden', async () => {
    const redis = await clienteRecienCreado();
    expect(redis.status).toBe('wait');
    const marca = new MarcaMensajeProcesado(redis);
    const buffer = new BufferTurno(redis);
    const idMensaje = crypto.randomUUID();
    const idConversacion = crypto.randomUUID();

    const [procesado, tamano] = await Promise.all([
      marca.estaProcesado(idMensaje),
      buffer.tamano(idConversacion),
    ]);

    expect(procesado).toBe(false);
    expect(tamano).toBe(0);
  });

  it('adaptadores de módulos distintos y llamadas repetidas en paralelo sobre un cliente sin conectar', async () => {
    const redis = await clienteRecienCreado();
    const marca = new MarcaMensajeProcesado(redis);
    const buffer = new BufferTurno(redis);
    const version = new VersionEstiloRedis(redis);

    const resultados = await Promise.all([
      marca.estaProcesado(crypto.randomUUID()),
      buffer.tamano(crypto.randomUUID()),
      version.obtener(),
      marca.estaProcesado(crypto.randomUUID()),
      buffer.tamano(crypto.randomUUID()),
    ]);

    expect(resultados).toHaveLength(5);
    expect(redis.status).toBe('ready');
  });
});
