import { Controller, Get, UseFilters } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import type { HealthCheckResult } from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { respuestaDesdeZod } from '../documentacion/index.js';
import { esquemaRespuestaSalud } from './esquema-respuesta.js';
import { FiltroSaludOperativo } from './filtro-salud-operativo.js';
import { IndicadorPostgres } from './indicador-postgres.js';
import { IndicadorRedis } from './indicador-redis.js';

/**
 * `GET /health` (D4; API2 delta): sin prefijo de versión — excepción operativa explícita para
 * que Docker, Dokploy y Uptime Kuma la consulten en una ruta fija conocida de antemano. Comprueba
 * Postgres y Redis en paralelo vía Terminus; `200` si ambos están arriba, `503` si alguno falla
 * (Terminus lanza `ServiceUnavailableException` automáticamente y nombra la dependencia caída).
 *
 * D1/D6/D4 de 00b: etiquetado `internal` (excluido del documento público, API8), documentado desde
 * `esquemaRespuestaSalud` (única fuente, skill §10) y exento de `application/problem+json`
 * (`FiltroSaludOperativo`, precedencia de filtro de controlador sobre el global, D6).
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
  @UseFilters(FiltroSaludOperativo)
  @ApiTags('internal')
  @ApiOperation({ operationId: 'obtenerSalud' })
  @respuestaDesdeZod(esquemaRespuestaSalud, {
    description: 'Estado de salud operativo de Postgres y Redis.',
  })
  comprobar(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.indicadorPostgres.comprobar(),
      () => this.indicadorRedis.comprobar(),
    ]);
  }
}
