import { Inject, Injectable, Optional } from '@nestjs/common';
import { asegurarConexion, REDIS_CLIENTE, type ClienteRedis } from '../../../../plataforma/redis/index.js';
import type { InterruptorGlobal } from '../../puertos/interruptor-global.js';

/** Misma clave que el prototipo (`estadoGlobal.ts`). */
export const CLAVE_INTERRUPTOR_GLOBAL = 'bot:activo';

/**
 * Token opcional para sobrescribir la clave. En producción nadie lo provee y se usa
 * {@link CLAVE_INTERRUPTOR_GLOBAL}; los tests de integración proveen una clave con prefijo por worker
 * para que dos archivos en paralelo no se apaguen el bot entre sí.
 */
export const CLAVE_INTERRUPTOR_GLOBAL_CONFIGURADA = Symbol('CLAVE_INTERRUPTOR_GLOBAL_CONFIGURADA');

/**
 * Adaptador Redis de solo lectura del puerto {@link InterruptorGlobal} (D14 de `design.md`).
 * `'false'` explícito ⇒ apagado; ausente o cualquier otro valor (incluido `'true'`) ⇒ activo —
 * mismo criterio de "falla abierto por defecto" que documenta D14 (el endpoint que lo escribe es
 * de la Fase 09).
 */
@Injectable()
export class InterruptorGlobalRedis implements InterruptorGlobal {
  constructor(
    @Inject(REDIS_CLIENTE) private readonly redis: ClienteRedis,
    @Optional()
    @Inject(CLAVE_INTERRUPTOR_GLOBAL_CONFIGURADA)
    private readonly clave: string = CLAVE_INTERRUPTOR_GLOBAL,
  ) {}

  async estaActivo(): Promise<boolean> {
    await asegurarConexion(this.redis);
    const valor = await this.redis.get(this.clave);
    return valor !== 'false';
  }
}
