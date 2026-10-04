import { Inject, Injectable } from '@nestjs/common';
import { asegurarConexion, REDIS_CLIENTE, type ClienteRedis } from '../../../../plataforma/redis/index.js';

function claveBuffer(idConversacion: string): string {
  return `turno:${idConversacion}:buffer`;
}

/**
 * Buffer efímero por conversación en Redis (D6/D7 de `design.md`, B6 del prototipo). Guarda
 * valores en el orden en que llegan (`RPUSH`); el llamador decide qué serializa ahí — T5 traduce
 * cada `EventoCanal.mensaje-entrante` a su propia representación antes de empujarla.
 */
@Injectable()
export class BufferTurno {
  constructor(@Inject(REDIS_CLIENTE) private readonly redis: ClienteRedis) {}

  async push(idConversacion: string, valor: string): Promise<void> {
    await asegurarConexion(this.redis);
    await this.redis.rpush(claveBuffer(idConversacion), valor);
  }

  /** Atómico (`MULTI`): lee todo el contenido acumulado y vacía la lista en la misma operación. */
  async leerYVaciar(idConversacion: string): Promise<readonly string[]> {
    await asegurarConexion(this.redis);
    const clave = claveBuffer(idConversacion);
    const resultados = await this.redis.multi().lrange(clave, 0, -1).del(clave).exec();
    return (resultados?.[0]?.[1] as readonly string[] | undefined) ?? [];
  }

  async tamano(idConversacion: string): Promise<number> {
    await asegurarConexion(this.redis);
    return this.redis.llen(claveBuffer(idConversacion));
  }

  async vaciar(idConversacion: string): Promise<void> {
    await asegurarConexion(this.redis);
    await this.redis.del(claveBuffer(idConversacion));
  }
}
