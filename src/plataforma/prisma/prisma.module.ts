import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * Módulo de plataforma para {@link PrismaService} (D6). A diferencia de `config`/`reloj`, no es
 * `@Global()`: los módulos de negocio futuros no acceden a Prisma directamente en su
 * `aplicacion/`, sino a través de sus propios repositorios en `infraestructura/` (skill
 * `luxeboreal-arquitectura` §1); `plataforma/salud` (T9) y este smoke (T8) lo importan
 * explícitamente.
 */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
