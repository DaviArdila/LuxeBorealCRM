import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../../../plataforma/config/index.js';
import { REDIS_CLIENTE, type ClienteRedis } from '../../../../plataforma/redis/index.js';
import type { ClaveSesion, ContadoresSesion } from '../../puertos/contadores-sesion.js';

function claveContador(sesion: ClaveSesion, contador: 'turnos' | 'audios' | 'fotos'): string {
  return `agente:${sesion.conversacionId}:v${String(sesion.version)}:${contador}`;
}

/**
 * Adaptador Redis de {@link ContadoresSesion} (D8 de la Fase 07a): un contador por sesión
 * (`conversacionId` + `version`) con `EXPIRE AGENTE_SESION_TTL_H`, renovado en cada incremento. La
 * versión cambia al transicionar, así que tras volver del asesor la cuenta arranca de cero sin
 * necesitar ningún evento de `conversaciones`.
 */
@Injectable()
export class ContadoresSesionRedis implements ContadoresSesion {
  constructor(
    @Inject(REDIS_CLIENTE) private readonly redis: ClienteRedis,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  async turnos(sesion: ClaveSesion): Promise<number> {
    await this.conectarSiHaceFalta();
    return Number((await this.redis.get(claveContador(sesion, 'turnos'))) ?? 0);
  }

  async registrarTurno(sesion: ClaveSesion): Promise<void> {
    await this.incrementar(claveContador(sesion, 'turnos'));
  }

  sumarAudio(sesion: ClaveSesion): Promise<number> {
    return this.incrementar(claveContador(sesion, 'audios'));
  }

  async reiniciarAudios(sesion: ClaveSesion): Promise<void> {
    await this.conectarSiHaceFalta();
    await this.redis.del(claveContador(sesion, 'audios'));
  }

  async fotosIndividuales(sesion: ClaveSesion): Promise<number> {
    await this.conectarSiHaceFalta();
    return Number((await this.redis.get(claveContador(sesion, 'fotos'))) ?? 0);
  }

  async sumarFotosIndividuales(sesion: ClaveSesion, cantidad: number): Promise<void> {
    await this.incrementar(claveContador(sesion, 'fotos'), cantidad);
  }

  private async incrementar(clave: string, por = 1): Promise<number> {
    await this.conectarSiHaceFalta();
    const resultados = await this.redis
      .multi()
      .incrby(clave, por)
      .expire(clave, this.configuracion.AGENTE_SESION_TTL_H * 3600)
      .exec();
    const cuenta = resultados?.[0]?.[1];
    if (typeof cuenta !== 'number') {
      throw new Error('Redis no devolvió la cuenta de la sesión del agente');
    }
    return cuenta;
  }

  private async conectarSiHaceFalta(): Promise<void> {
    if (this.redis.status === 'wait' || this.redis.status === 'close' || this.redis.status === 'end') {
      await this.redis.connect();
    }
  }
}
