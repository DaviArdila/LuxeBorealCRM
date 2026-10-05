import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../../../plataforma/config/index.js';
import { asegurarConexion, REDIS_CLIENTE, type ClienteRedis } from '../../../../plataforma/redis/index.js';
import { CLOCK, type Clock } from '../../../../plataforma/reloj/index.js';

function claveHora(idContacto: string, ahora: Date): string {
  return `rate:${idContacto}:h:${ahora.toISOString().slice(0, 13)}`; // YYYY-MM-DDTHH
}

function claveDia(idContacto: string, ahora: Date): string {
  return `rate:${idContacto}:d:${ahora.toISOString().slice(0, 10)}`; // YYYY-MM-DD
}

const TTL_HORA_S = 2 * 60 * 60; // dos horas de margen sobre el bucket de una hora
const TTL_DIA_S = 2 * 24 * 60 * 60; // dos días de margen sobre el bucket de un día

/**
 * Contador de mensajes por contacto en Redis (T3, R13 parcial): `INCR` + `EXPIRE` sobre dos
 * ventanas fijas (hora y día en curso, UTC), igual que `rateLimiter.ts` del prototipo. El TTL de
 * cada clave solo se fija en el primer `INCR` de la ventana (cuando el contador pasa a 1): fijarlo
 * de nuevo en cada llamada movería el vencimiento hacia adelante y la ventana nunca cerraría.
 */
@Injectable()
export class ContadorRateLimit {
  constructor(
    @Inject(REDIS_CLIENTE) private readonly redis: ClienteRedis,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** `true` si el contacto sigue dentro de `RATE_LIMIT_POR_HORA` y `RATE_LIMIT_POR_DIA`. */
  async verificarLimite(idContacto: string): Promise<boolean> {
    await asegurarConexion(this.redis);
    const ahora = this.clock.ahora();

    const conteoHora = await this.incrementarConTtl(claveHora(idContacto, ahora), TTL_HORA_S);
    const conteoDia = await this.incrementarConTtl(claveDia(idContacto, ahora), TTL_DIA_S);

    return conteoHora <= this.configuracion.RATE_LIMIT_POR_HORA && conteoDia <= this.configuracion.RATE_LIMIT_POR_DIA;
  }

  private async incrementarConTtl(clave: string, ttlS: number): Promise<number> {
    const conteo = await this.redis.incr(clave);
    if (conteo === 1) {
      await this.redis.expire(clave, ttlS);
    }
    return conteo;
  }
}
