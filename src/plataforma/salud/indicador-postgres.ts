import { Inject, Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import { CONFIGURACION } from '../config/index.js';
import type { Configuracion } from '../config/index.js';
import { PrismaService } from '../prisma/index.js';
import { conTimeout } from './con-timeout.js';

/**
 * Indicador de salud de Postgres (PLT4, D13): ejecuta `SELECT 1` con `$queryRaw` contra
 * {@link PrismaService}, con un timeout de `HEALTH_TIMEOUT_MS`. Si falla o excede el timeout,
 * devuelve `{ status: 'down' }` **sin** el mensaje de la excepción original — el error se
 * registra en el log de observabilidad (redactado por `nestjs-pino`, R14), nunca en el cuerpo de
 * la respuesta HTTP.
 */
@Injectable()
export class IndicadorPostgres {
  private readonly logger = new Logger(IndicadorPostgres.name);

  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly prisma: PrismaService,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  async comprobar(): Promise<HealthIndicatorResult> {
    const indicador = this.healthIndicatorService.check('postgres');
    try {
      await conTimeout(this.prisma.$queryRaw`SELECT 1`, this.configuracion.HEALTH_TIMEOUT_MS);
      return indicador.up();
    } catch (error) {
      this.logger.error('El indicador de salud de postgres falló', error);
      return indicador.down();
    }
  }
}
