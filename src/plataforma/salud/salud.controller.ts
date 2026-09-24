import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import type { HealthCheckResult } from '@nestjs/terminus';
import { IndicadorPostgres } from './indicador-postgres.js';
import { IndicadorRedis } from './indicador-redis.js';

/**
 * `GET /health` (D4; API2 delta): sin prefijo de versión — excepción operativa explícita para
 * que Docker, Dokploy y Uptime Kuma la consulten en una ruta fija conocida de antemano. Comprueba
 * Postgres y Redis en paralelo vía Terminus; `200` si ambos están arriba, `503` si alguno falla
 * (Terminus lanza `ServiceUnavailableException` automáticamente y nombra la dependencia caída).
 */
@Controller('health')
export class SaludController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicadorPostgres: IndicadorPostgres,
    private readonly indicadorRedis: IndicadorRedis,
  ) {}

  @Get()
  @HealthCheck()
  comprobar(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.indicadorPostgres.comprobar(),
      () => this.indicadorRedis.comprobar(),
    ]);
  }
}
