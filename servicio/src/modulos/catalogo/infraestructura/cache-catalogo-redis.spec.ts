import type { ClienteRedis } from '../../../plataforma/redis/index.js';
import type { Clock } from '../../../plataforma/reloj/index.js';
import type { ProductoResumen } from '../dominio/producto.js';
import { CacheCatalogoRedis } from './cache-catalogo-redis.js';

// Los 4 escenarios cubren CAT4/CAT5 (`openspec/changes/fase-02-catalogo/specs/catalogo/spec.md`),
// título exacto. "El catálogo compacto no lleva precios..." (CAT4, escenario 2) ya se prueba con
// `armarCatalogoCompacto` en `dominio/producto.spec.ts` (T3): esta caché guarda `ProductoResumen`,
// nunca texto, y no decide qué campos lleva.

/**
 * Doble de {@link ClienteRedis} para tests unitarios (sin Redis real): reproduce el subconjunto de
 * `ioredis` que usa {@link CacheCatalogoRedis} (`status`, `connect`, `get`, `incr`), igual de
 * "estado real, sin red" que el resto del arnés de fakes del repositorio (`test/fakes/`).
 */
class ClienteRedisFalso {
  status: 'wait' | 'ready' = 'wait';
  private readonly valores = new Map<string, string>();

  connect(): Promise<void> {
    this.status = 'ready';
    return Promise.resolve();
  }

  get(clave: string): Promise<string | null> {
    return Promise.resolve(this.valores.get(clave) ?? null);
  }

  incr(clave: string): Promise<number> {
    const siguiente = Number(this.valores.get(clave) ?? '0') + 1;
    this.valores.set(clave, String(siguiente));
    return Promise.resolve(siguiente);
  }
}

class ClockDePrueba implements Clock {
  constructor(private readonly instante: Date) {}
  ahora(): Date {
    return this.instante;
  }
}

function comoClienteRedis(falso: ClienteRedisFalso): ClienteRedis {
  return falso as unknown as ClienteRedis;
}

function productoResumen(id: string, nombre: string): ProductoResumen {
  return { id, sku: `SKU-${id}`, nombre, descripcionCorta: 'descripción' };
}

describe('modulos/catalogo/infraestructura/CacheCatalogoRedis', () => {
  it('construir el adaptador no abre conexión a Redis (A1)', () => {
    const redis = new ClienteRedisFalso();

    new CacheCatalogoRedis(comoClienteRedis(redis), new ClockDePrueba(new Date('2026-09-26T12:00:00Z')));

    expect(redis.status).toBe('wait');
  });

  it('CAT4 — Una escritura directa en producto sin pasar por la invalidación no se refleja de inmediato', async () => {
    const redis = new ClienteRedisFalso();
    const cache = new CacheCatalogoRedis(comoClienteRedis(redis), new ClockDePrueba(new Date('2026-09-26T12:00:00Z')));
    const copiaOriginal = [productoResumen('1', 'Alfombra')];

    await cache.reemplazar(copiaOriginal);
    expect(await cache.obtenerVigente()).toEqual(copiaOriginal);

    // "Escritura directa" simulada: un producto nuevo aparecería en el origen de datos, pero nadie
    // llamó a `invalidar()` ni a `reemplazar()` de nuevo con la lista actualizada.
    expect(await cache.obtenerVigente()).toEqual(copiaOriginal);
  });

  it('CAT5 — Invalidar el catálogo incrementa la versión compartida', async () => {
    const redis = new ClienteRedisFalso();
    const cache = new CacheCatalogoRedis(comoClienteRedis(redis), new ClockDePrueba(new Date('2026-09-26T12:00:00Z')));
    const antes = Number((await redis.get('catalogo:version')) ?? '0');

    await cache.invalidar();

    expect(Number(await redis.get('catalogo:version'))).toBe(antes + 1);
  });

  it('CAT5 — Invalidar el catálogo hace que la siguiente lectura vea el cambio de inmediato', async () => {
    const redis = new ClienteRedisFalso();
    const cache = new CacheCatalogoRedis(comoClienteRedis(redis), new ClockDePrueba(new Date('2026-09-26T12:00:00Z')));
    const copiaOriginal = [productoResumen('1', 'Alfombra')];
    await cache.reemplazar(copiaOriginal);
    expect(await cache.obtenerVigente()).toEqual(copiaOriginal);

    await cache.invalidar();

    expect(await cache.obtenerVigente()).toBeNull();

    const copiaActualizada = [productoResumen('1', 'Alfombra'), productoResumen('2', 'Banco')];
    await cache.reemplazar(copiaActualizada);
    expect(await cache.obtenerVigente()).toEqual(copiaActualizada);
  });

  it('CAT5 — Otro proceso que incrementa la versión compartida invalida esta copia igual', async () => {
    const redis = new ClienteRedisFalso();
    const clock = new ClockDePrueba(new Date('2026-09-26T12:00:00Z'));
    const cacheDeEsteProceso = new CacheCatalogoRedis(comoClienteRedis(redis), clock);
    const cacheDeOtroProceso = new CacheCatalogoRedis(comoClienteRedis(redis), clock);
    const copiaOriginal = [productoResumen('1', 'Alfombra')];
    await cacheDeEsteProceso.reemplazar(copiaOriginal);
    expect(await cacheDeEsteProceso.obtenerVigente()).toEqual(copiaOriginal);

    // Otro proceso (futuro importador) incrementa la versión compartida directamente, sin pasar
    // por esta instancia del adaptador.
    await cacheDeOtroProceso.invalidar();

    expect(await cacheDeEsteProceso.obtenerVigente()).toBeNull();
  });
});
