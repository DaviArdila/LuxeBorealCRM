import { Inject, Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import { CONFIGURACION } from '../config/index.js';
import type { Configuracion } from '../config/index.js';
import { REDIS_CLIENTE } from '../redis/index.js';
import type { ClienteRedis } from '../redis/index.js';
import { conTimeout } from './con-timeout.js';

/**
 * Indicador de salud de Redis (PLT4, D13): hace `PING` contra el {@link ClienteRedis} de
 * plataforma, con un timeout de `HEALTH_TIMEOUT_MS`. Si falla o excede el timeout, devuelve
 * `{ status: 'down' }` **sin** el mensaje de la excepción original — el error se registra en el
 * log de observabilidad (redactado por `nestjs-pino`, R14), nunca en el cuerpo de la respuesta
 * HTTP.
 */
@Injectable()
export class IndicadorRedis {
  private readonly logger = new Logger(IndicadorRedis.name);

  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(REDIS_CLIENTE) private readonly cliente: ClienteRedis,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  async comprobar(): Promise<HealthIndicatorResult> {
    const indicador = this.healthIndicatorService.check('redis');
    try {
      await conTimeout(this.conectarYPing(), this.configuracion.HEALTH_TIMEOUT_MS);
      return indicador.up();
    } catch (error) {
      this.logger.error('El indicador de salud de redis falló', error);
      return indicador.down();
    }
  }

  /**
   * `lazyConnect: true` + `enableOfflineQueue: false` (D12, `redis.module.ts`): el primer
   * comando emitido antes de conectar se rechaza en vez de esperar, así que hay que conectar
   * primero. `connect()` NO es idempotente — rechaza con "Redis is already
   * connecting/connected" si el estado ya es `connecting`/`connect`/`ready`
   * (`node_modules/ioredis/built/Redis.js`, `_connect()`) — por eso solo se llama cuando el
   * estado todavía no está en curso (`wait`, `close` o `end`).
   */
  private async conectarYPing(): Promise<void> {
    if (this.cliente.status === 'wait' || this.cliente.status === 'close' || this.cliente.status === 'end') {
      await this.cliente.connect();
    }
    await this.cliente.ping();
  }
}
