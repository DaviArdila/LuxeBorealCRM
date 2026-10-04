import { Inject, Injectable } from '@nestjs/common';
import { asegurarConexion, REDIS_CLIENTE } from '../../../plataforma/redis/index.js';
import type { ClienteRedis } from '../../../plataforma/redis/index.js';
import { CLOCK } from '../../../plataforma/reloj/index.js';
import type { Clock } from '../../../plataforma/reloj/index.js';
import type { ProductoResumen } from '../dominio/producto.js';
import type { CacheCatalogo } from '../puertos/cache-catalogo.js';

/** Clave de versión compartida en Redis (skill `luxeboreal-arquitectura` §8, design.md D2). */
const CLAVE_VERSION = 'catalogo:version';

/**
 * TTL de respaldo (design.md D2): resiliencia técnica, no un dato de negocio (R15 no aplica) — por
 * eso es una constante de código y no un `parametro`. Sirve de red de seguridad si `catalogo:version`
 * se pierde (por ejemplo, un `FLUSHALL` accidental o el reinicio de un Redis sin persistencia) sin
 * que nadie haya llamado a {@link CacheCatalogoRedis.invalidar}.
 */
const TTL_RESPALDO_MS = 5 * 60_000;

interface CopiaEnCache {
  readonly version: string;
  readonly expiraEn: number;
  readonly productos: readonly ProductoResumen[];
}

/**
 * Adaptador Redis del puerto {@link CacheCatalogo} (design.md D2, CAT4, CAT5). Estado de
 * **instancia** (un campo privado construido por Nest), nunca un `let` de módulo (corrige A1).
 * Inyecta {@link REDIS_CLIENTE} de `plataforma/redis` (nunca un futuro `modulos/colas`, corrige
 * A3) y {@link CLOCK} de `plataforma/reloj` para el TTL de respaldo (PLT2: nunca `Date.now()`).
 *
 * Conexión perezosa: construir esta clase no conecta nada; antes de cada `GET`/`INCR` sobre
 * {@link CLAVE_VERSION} se llama `asegurarConexion` de `plataforma/redis`, que conecta si hace
 * falta y espera el `ready` si otra llamada ya está conectando.
 */
@Injectable()
export class CacheCatalogoRedis implements CacheCatalogo {
  private copia: CopiaEnCache | null = null;

  constructor(
    @Inject(REDIS_CLIENTE) private readonly redis: ClienteRedis,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async obtenerVigente(): Promise<readonly ProductoResumen[] | null> {
    const version = await this.obtenerVersionActual();
    const ahora = this.clock.ahora().getTime();
    if (this.copia && this.copia.version === version && this.copia.expiraEn > ahora) {
      return this.copia.productos;
    }
    return null;
  }

  async reemplazar(productos: readonly ProductoResumen[]): Promise<void> {
    const version = await this.obtenerVersionActual();
    const ahora = this.clock.ahora().getTime();
    this.copia = { version, productos, expiraEn: ahora + TTL_RESPALDO_MS };
  }

  async invalidar(): Promise<void> {
    this.copia = null;
    await asegurarConexion(this.redis);
    await this.redis.incr(CLAVE_VERSION);
  }

  private async obtenerVersionActual(): Promise<string> {
    await asegurarConexion(this.redis);
    return (await this.redis.get(CLAVE_VERSION)) ?? '0';
  }
}
