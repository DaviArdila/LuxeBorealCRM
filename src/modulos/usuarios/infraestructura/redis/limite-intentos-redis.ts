import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../../../plataforma/config/index.js';
import { asegurarConexion, REDIS_CLIENTE, type ClienteRedis } from '../../../../plataforma/redis/index.js';
import { normalizarEmail } from '../../dominio/usuario.js';
import type { LimiteIntentos, ResultadoIntento } from '../../puertos/limite-intentos.js';

/** La clave lleva la huella SHA-256 del correo, nunca el correo en claro (USR8, R14). */
function clave(email: string, ip: string): string {
  const huella = createHash('sha256').update(normalizarEmail(email)).digest('hex');
  return `auth:intentos:${huella}:${ip}`;
}

/**
 * Contador por correo e IP con `INCR` + `EXPIRE NX` en un `MULTI` (USR8, D5): la ventana arranca con el primer
 * intento y no se alarga con los siguientes, así el bloqueo vence solo.
 */
@Injectable()
export class LimiteIntentosRedis implements LimiteIntentos {
  constructor(
    @Inject(REDIS_CLIENTE) private readonly redis: ClienteRedis,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  async consumirIntento(email: string, ip: string): Promise<ResultadoIntento> {
    await asegurarConexion(this.redis);
    const ventanaS = this.configuracion.AUTH_VENTANA_MIN * 60;
    const respuestas = await this.redis
      .multi()
      .incr(clave(email, ip))
      .expire(clave(email, ip), ventanaS, 'NX')
      .ttl(clave(email, ip))
      .exec();
    const fallo = respuestas === null ? new Error('MULTI abortado') : respuestas.find(([error]) => error !== null)?.[0];
    if (fallo) throw fallo;
    const conteo = Number(respuestas?.[0]?.[1]);
    const ttl = Number(respuestas?.[2]?.[1]);
    if (conteo <= this.configuracion.AUTH_INTENTOS_MAX) {
      return { permitido: true };
    }
    return { permitido: false, reintentarEnS: ttl > 0 ? ttl : ventanaS };
  }

  async reiniciar(email: string, ip: string): Promise<void> {
    await asegurarConexion(this.redis);
    await this.redis.del(clave(email, ip));
  }
}
