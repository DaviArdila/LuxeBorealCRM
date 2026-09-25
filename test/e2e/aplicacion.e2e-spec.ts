import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import type { Response } from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configurarAplicacion } from '../../src/configurar-aplicacion.js';
import { CONFIGURACION, type Configuracion } from '../../src/plataforma/config/index.js';
import { PrismaService } from '../../src/plataforma/prisma/index.js';
import { REDIS_CLIENTE, type ClienteRedis } from '../../src/plataforma/redis/index.js';
import { esquemaRespuestaSalud } from '../../src/plataforma/salud/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../soporte/infraestructura.js';

interface CuerpoHealth {
  readonly status: string;
  readonly info: Record<string, { status: string }>;
  readonly error: Record<string, { status: string }>;
  readonly details: Record<string, { status: string }>;
}

function configuracionValida(): Configuracion {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'silent',
    DATABASE_URL: urlPostgresDePrueba(),
    REDIS_URL: urlRedisDePrueba(),
    HEALTH_TIMEOUT_MS: 1500,
    // Sin fijar explícitamente: confirma que el e2e existente de 00a sigue en verde con el
    // default `false` de D7, sin que este archivo dependa de /docs.
    DOCS_HABILITADO: false,
  };
}

/** `app.getHttpServer()` está tipado `any` en `@nestjs/common`; este helper lo tipa una sola vez. */
function obtenerServidor(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

/**
 * Arranca la aplicación completa con `configurarAplicacion` (D14): mismo cableado exacto que
 * `main.ts`. `overrideProvider(CONFIGURACION)` sustituye la configuración real por una que
 * apunta a los contenedores de Testcontainers (o a un puerto sin servicio, según el test), sin
 * necesidad de variables de entorno reales.
 */
async function crearAplicacion(configuracion: Configuracion): Promise<INestApplication> {
  const { AppModule } = await import('../../src/app.module.js');
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracion)
    .compile();

  const app = modulo.createNestApplication();
  configurarAplicacion(app);
  // `listen(0)` (puerto efímero) en vez de solo `init()`: deja el servidor HTTP realmente
  // escuchando antes de que Supertest emita cualquier request, para que la carrera entre una
  // solicitud en curso y `app.close()` (PLT5) sea determinista.
  await app.listen(0);
  return app;
}

describe('Arranque completo de la aplicación (T9, e2e)', () => {
  // Primer test del archivo, a propósito: es la primera vez que este proceso importa
  // `app.module.js`. Confirma A1 (nada se abre ni se lee al importar) antes de que cualquier
  // otro test de este archivo importe el módulo (y lo deje en la caché de ESM).
  it('importar app.module.js sin variables de entorno no lanza al importar (A1)', async () => {
    const originales = { DATABASE_URL: process.env.DATABASE_URL, REDIS_URL: process.env.REDIS_URL };
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;

    try {
      await expect(import('../../src/app.module.js')).resolves.toBeDefined();
    } finally {
      if (originales.DATABASE_URL !== undefined) process.env.DATABASE_URL = originales.DATABASE_URL;
      if (originales.REDIS_URL !== undefined) process.env.REDIS_URL = originales.REDIS_URL;
    }
  });

  describe('con Postgres y Redis arriba', () => {
    let app: INestApplication;

    beforeEach(async () => {
      app = await crearAplicacion(configuracionValida());
    });

    afterEach(async () => {
      await app.close();
    });

    it('PLT4 — Postgres y Redis arriba responden 200', async () => {
      const respuesta = await request(obtenerServidor(app)).get('/health');
      const cuerpo = respuesta.body as CuerpoHealth;

      expect(respuesta.status).toBe(200);
      expect(cuerpo.details.postgres?.status).toBe('up');
      expect(cuerpo.details.redis?.status).toBe('up');
      // API8/D6, T4: la respuesta real valida contra esquemaRespuestaSalud (única fuente que
      // documenta /health, respuestaDesdeZod) — confirma también que FiltroSaludOperativo
      // conserva el cuerpo propio de Terminus, no application/problem+json (que no tiene
      // `details`/`info`/`error` con esta forma).
      expect(() => esquemaRespuestaSalud.parse(cuerpo)).not.toThrow();
    });

    it('API2 — GET /health es la única ruta pública sin el prefijo de versión', async () => {
      const respuestaSinPrefijo = await request(obtenerServidor(app)).get('/health');
      const respuestaConPrefijo = await request(obtenerServidor(app)).get('/api/v1/health');

      expect(respuestaSinPrefijo.status).toBe(200);
      expect(respuestaConPrefijo.status).toBe(404);
    });

    it('PLT5 — Una solicitud en curso termina antes de cerrar el servidor', async () => {
      const servidor = obtenerServidor(app);

      // Espera a que el servidor acepte la conexión TCP (evento 'connection') antes de cerrar,
      // para que la solicitud esté realmente en curso — no solo construida — cuando llega
      // `app.close()` (PLT5). `request(...).get(...)` es perezoso: no envía nada hasta que se
      // llama `.end()`/se espera, así que se dispara con `.end(callback)` explícito.
      const conexionAceptada = new Promise<void>((resolver) => {
        servidor.once('connection', () => {
          resolver();
        });
      });
      const solicitudEnCurso = new Promise<Response>((resolver, rechazar) => {
        request(servidor)
          .get('/health')
          .end((error: unknown, respuesta) => {
            if (error) {
              rechazar(error instanceof Error ? error : new Error('Error desconocido al enviar la solicitud de prueba'));
              return;
            }
            resolver(respuesta);
          });
      });

      await conexionAceptada;
      await app.close();
      const respuesta = await solicitudEnCurso;
      const cuerpo = respuesta.body as CuerpoHealth;

      // Terminus marca sus propios chequeos como `status: 'shutting_down'` (503) en cuanto
      // arranca el apagado (`@nestjs/terminus`, `HealthCheckExecutorService.beforeApplicationShutdown`)
      // — protección propia para que un balanceador deje de enrutar tráfico nuevo. Lo que exige
      // PLT5 es que la solicitud ya aceptada reciba una respuesta HTTP completa y válida (nunca
      // una conexión cortada a la mitad); ambos estados son una respuesta completa.
      expect([200, 503]).toContain(respuesta.status);
      expect(['ok', 'shutting_down']).toContain(cuerpo.status);
      expect(cuerpo.details.postgres?.status).toBe('up');
      expect(cuerpo.details.redis?.status).toBe('up');
    });
  });

  describe('con Redis caído', () => {
    let app: INestApplication;

    beforeEach(async () => {
      app = await crearAplicacion({ ...configuracionValida(), REDIS_URL: 'redis://127.0.0.1:65534' });
    });

    afterEach(async () => {
      await app.close();
    });

    it('PLT4 — Una dependencia caída responde error nombrándola', async () => {
      const respuesta = await request(obtenerServidor(app)).get('/health');
      const cuerpo = respuesta.body as CuerpoHealth;

      expect(respuesta.status).toBe(503);
      expect(cuerpo.error).toEqual({ redis: { status: 'down' } });
      expect(cuerpo.info).toEqual({ postgres: { status: 'up' } });
      // API4, D6: exento de problem+json también en el caso 503 — sigue siendo el cuerpo de
      // Terminus, validado por el mismo esquema que el caso 200.
      expect(() => esquemaRespuestaSalud.parse(cuerpo)).not.toThrow();
    });

    it('PLT4 — El cuerpo de health no expone secretos', async () => {
      const respuesta = await request(obtenerServidor(app)).get('/health');

      expect(respuesta.status).toBe(503);
      expect(JSON.stringify(respuesta.body)).not.toMatch(/redis:\/\/|127\.0\.0\.1:65534|ECONNREFUSED/i);
    });
  });

  describe('apagado ordenado', () => {
    it('PLT5 — SIGTERM cierra las conexiones a Postgres y Redis', async () => {
      // `app.close()` ejercita el mismo `enableShutdownHooks()` que dispara una señal SIGTERM
      // real (D14). No se envía SIGTERM de verdad: en Windows la señal a un proceso hijo lo mata
      // sin ejecutar los hooks de apagado, así que ese test no sería portable (nota de D14).
      const app = await crearAplicacion(configuracionValida());
      const prisma = app.get(PrismaService);
      const redis = app.get<ClienteRedis>(REDIS_CLIENTE);

      // Fuerza que ambos clientes conecten antes de cerrar, para comprobar que el cierre
      // realmente los desconecta. `$disconnect` se espía porque Prisma reconecta perezosamente
      // en la siguiente consulta (no hay un `prisma.status` público que quede en un valor
      // "cerrado" observable, a diferencia de `ioredis`); comprobar que `onApplicationShutdown`
      // efectivamente lo llamó es la evidencia equivalente para Prisma.
      await prisma.$queryRaw`SELECT 1`;
      await redis.connect();
      const espiaDesconexionPrisma = vi.spyOn(prisma, '$disconnect');

      // El estado de `ioredis` pasa a `end` cuando el socket termina de cerrarse, un evento que
      // puede llegar justo después de que `quit()` resuelva (no en el mismo microtask) — se
      // registra el listener antes de cerrar para no perder el evento (sin sondear con reintentos
      // ni leer la hora, PLT2).
      const cierreRedis = new Promise<void>((resolver) => {
        if (redis.status === 'end') {
          resolver();
          return;
        }
        redis.once('end', () => {
          resolver();
        });
      });

      await app.close();
      await cierreRedis;

      expect(redis.status).toBe('end');
      expect(espiaDesconexionPrisma).toHaveBeenCalledOnce();
    });
  });
});
