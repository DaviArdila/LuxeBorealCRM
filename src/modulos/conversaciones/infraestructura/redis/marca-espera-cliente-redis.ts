import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../../../plataforma/config/index.js';
import { REDIS_CLIENTE, type ClienteRedis } from '../../../../plataforma/redis/index.js';
import type { EsperaCliente, MarcaEsperaCliente } from '../../puertos/marca-espera-cliente.js';

/** Las claves de una conversación abandonada no deben vivir para siempre: un barrido no las limpiaría si nadie escribe. */
const TTL_CLAVES_S = 7 * 24 * 3600;

/** Abre la espera salvo que ya esté avisada. `ZADD NX` conserva el instante del primer mensaje. */
const SCRIPT_REGISTRAR = `
if redis.call('SISMEMBER', KEYS[2], ARGV[2]) == 1 then return 0 end
redis.call('ZADD', KEYS[1], 'NX', ARGV[1], ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 1`;

/** Pasa de pendiente a avisada de forma atómica: solo quien la quita del conjunto pendiente gana. */
const SCRIPT_RECLAMAR = `
if redis.call('ZREM', KEYS[1], ARGV[1]) == 0 then return 0 end
redis.call('SADD', KEYS[2], ARGV[1])
redis.call('EXPIRE', KEYS[2], ARGV[2])
return 1`;

/**
 * Adaptador Redis de la marca de «cliente esperando» (CNV12, D4 de la Fase 08d): un ZSET de esperas **pendientes**
 * (miembro = id de la conversación, puntaje = instante del primer mensaje sin respuesta) y un SET de esperas ya
 * **avisadas**. Nunca guarda el contenido de un mensaje (R14). Las claves cuelgan de `COLAS_PREFIJO`, que cada
 * worker de pruebas ya aísla. Un reinicio de Redis pierde las esperas abiertas: es un aviso de apoyo, el traspaso
 * ya avisó (límite documentado).
 */
@Injectable()
export class MarcaEsperaClienteRedis implements MarcaEsperaCliente {
  private readonly clavePendiente: string;
  private readonly claveAvisada: string;

  constructor(
    @Inject(REDIS_CLIENTE) private readonly redis: ClienteRedis,
    @Inject(CONFIGURACION) configuracion: Pick<Configuracion, 'COLAS_PREFIJO'>,
  ) {
    this.clavePendiente = `${configuracion.COLAS_PREFIJO}:espera-cliente:pendiente`;
    this.claveAvisada = `${configuracion.COLAS_PREFIJO}:espera-cliente:avisada`;
  }

  async registrar(conversacionId: string, ahora: Date): Promise<void> {
    await this.conectarSiHaceFalta();
    await this.redis.eval(
      SCRIPT_REGISTRAR,
      2,
      this.clavePendiente,
      this.claveAvisada,
      String(ahora.getTime()),
      conversacionId,
      String(TTL_CLAVES_S),
    );
  }

  async cerrar(conversacionId: string): Promise<void> {
    await this.conectarSiHaceFalta();
    await this.redis.multi().zrem(this.clavePendiente, conversacionId).srem(this.claveAvisada, conversacionId).exec();
  }

  async vencidas(limite: Date, maximo: number): Promise<readonly EsperaCliente[]> {
    await this.conectarSiHaceFalta();
    const plano = await this.redis.zrangebyscore(
      this.clavePendiente,
      '-inf',
      limite.getTime(),
      'WITHSCORES',
      'LIMIT',
      0,
      maximo,
    );
    const esperas: EsperaCliente[] = [];
    for (let i = 0; i < plano.length; i += 2) {
      esperas.push({ conversacionId: plano[i] ?? '', desde: new Date(Number(plano[i + 1])) });
    }
    return esperas;
  }

  async reclamarAviso(conversacionId: string): Promise<boolean> {
    await this.conectarSiHaceFalta();
    const resultado = await this.redis.eval(
      SCRIPT_RECLAMAR,
      2,
      this.clavePendiente,
      this.claveAvisada,
      conversacionId,
      String(TTL_CLAVES_S),
    );
    return resultado === 1;
  }

  async devolverAviso(espera: EsperaCliente): Promise<void> {
    await this.conectarSiHaceFalta();
    await this.redis
      .multi()
      .srem(this.claveAvisada, espera.conversacionId)
      .zadd(this.clavePendiente, 'NX', espera.desde.getTime(), espera.conversacionId)
      .exec();
  }

  private async conectarSiHaceFalta(): Promise<void> {
    if (this.redis.status === 'wait' || this.redis.status === 'close' || this.redis.status === 'end') {
      await this.redis.connect();
    }
  }
}
