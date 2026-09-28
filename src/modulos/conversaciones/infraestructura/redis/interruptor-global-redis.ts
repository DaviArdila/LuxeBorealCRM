import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENTE, type ClienteRedis } from '../../../../plataforma/redis/index.js';
import type { InterruptorGlobal } from '../../puertos/interruptor-global.js';

/** Misma clave que el prototipo (`estadoGlobal.ts`). */
export const CLAVE_INTERRUPTOR_GLOBAL = 'bot:activo';

/**
 * Adaptador Redis de solo lectura del puerto {@link InterruptorGlobal} (D14 de `design.md`).
 * `'false'` explícito ⇒ apagado; ausente o cualquier otro valor (incluido `'true'`) ⇒ activo —
 * mismo criterio de "falla abierto por defecto" que documenta D14 (el endpoint que lo escribe es
 * de la Fase 09).
 */
@Injectable()
export class InterruptorGlobalRedis implements InterruptorGlobal {
  constructor(@Inject(REDIS_CLIENTE) private readonly redis: ClienteRedis) {}

  async estaActivo(): Promise<boolean> {
    await this.conectarSiHaceFalta();
    const valor = await this.redis.get(CLAVE_INTERRUPTOR_GLOBAL);
    return valor !== 'false';
  }

  private async conectarSiHaceFalta(): Promise<void> {
    if (this.redis.status === 'wait' || this.redis.status === 'close' || this.redis.status === 'end') {
      await this.redis.connect();
    }
  }
}
