import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../plataforma/prisma/index.js';
import type { RepositorioHorario } from '../puertos/repositorio-horario.js';

const CLAVE_HORARIO_ATENCION = 'horario_atencion';

/**
 * Adaptador Prisma del puerto {@link RepositorioHorario} (design.md D5). Solo lectura, contra
 * `excepcion_horario` y `parametro` — no parsea ni valida la forma de `valor` (esa responsabilidad
 * es del dominio, T4). Sin `$queryRaw` (matriz de amenazas de `tasks.md`): solo *query builder*.
 */
@Injectable()
export class RepositorioHorarioPrisma implements RepositorioHorario {
  constructor(private readonly prisma: PrismaService) {}

  async existeExcepcion(fechaIso: string): Promise<boolean> {
    const excepcion = await this.prisma.excepcionHorario.findUnique({
      where: { fecha: new Date(fechaIso) },
    });
    return excepcion !== null;
  }

  async obtenerPatronSemanal(): Promise<unknown> {
    const parametro = await this.prisma.parametro.findUnique({
      where: { clave: CLAVE_HORARIO_ATENCION },
    });
    return parametro?.valor ?? null;
  }
}
