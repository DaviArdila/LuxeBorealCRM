import { Inject, Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import { CONFIGURACION } from '../config/index.js';
import type { Configuracion } from '../config/index.js';
import { asegurarConexion, REDIS_CLIENTE } from '../redis/index.js';
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
   * comando emitido antes del `ready` se rechaza en vez de esperar, así que primero se asegura la
   * conexión con `asegurarConexion`, que conecta si hace falta y espera el `ready` si otro uso
   * del cliente ya está conectando (antes ese caso daba `down` aunque Redis estuviera sano). El
   * plazo total sigue acotado por `HEALTH_TIMEOUT_MS` en {@link comprobar}.
   */
  private async conectarYPing(): Promise<void> {
    await asegurarConexion(this.cliente);
    await this.cliente.ping();
  }
}
