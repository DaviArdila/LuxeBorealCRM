import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from '../prisma/index.js';
import { RedisModule } from '../redis/index.js';
import { IndicadorPostgres } from './indicador-postgres.js';
import { IndicadorRedis } from './indicador-redis.js';
import { SaludController } from './salud.controller.js';

/**
 * Módulo de health check (PLT4, PLT5, D4). Solo importa `plataforma/prisma` y `plataforma/redis`
 * (`plataforma/config` es `@Global()`, no hace falta listarlo) — nunca `modulos/` (tabla de
 * módulos y dependencias de `design.md`, regla de fronteras `plataforma-no-conoce-modulos`).
 */
@Module({
  imports: [TerminusModule, PrismaModule, RedisModule],
  controllers: [SaludController],
  providers: [IndicadorPostgres, IndicadorRedis],
})
export class SaludModule {}
