import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../plataforma/prisma/index.js';
import type { CandidataExclusion, CandidataTarifa } from '../dominio/envio.js';
import type { NuevoEventoFueraCobertura, RepositorioEnvio } from '../puertos/repositorio-envio.js';

/**
 * Adaptador Prisma del puerto {@link RepositorioEnvio} (design.md D1): consulta `tarifa_estimada`
 * y `zona_sin_cobertura` con `include: { departamento, ciudad }` — la relación que
 * `prisma/schema.prisma` ya declara — para resolver los nombres sin importar `modulos/geografia`.
 * Solo usa el *query builder* de Prisma (`findMany`, `create`), nunca `$queryRaw` (design.md
 * "Threat Matrix").
 */
@Injectable()
export class RepositorioEnvioPrisma implements RepositorioEnvio {
  constructor(private readonly prisma: PrismaService) {}

  async listarExclusiones(): Promise<readonly CandidataExclusion[]> {
    const filas = await this.prisma.zonaSinCobertura.findMany({
      include: { departamento: true, ciudad: true },
    });

    return filas.map((fila) => ({
      departamentoNombre: fila.departamento.nombre,
      ciudadNombre: fila.ciudad?.nombre ?? null,
    }));
  }

  async listarTarifas(): Promise<readonly CandidataTarifa[]> {
    const filas = await this.prisma.tarifaEstimada.findMany({
      include: { departamento: true, ciudad: true },
    });

    return filas.map((fila) => ({
      id: fila.id,
      departamentoNombre: fila.departamento?.nombre ?? null,
      ciudadNombre: fila.ciudad?.nombre ?? null,
      pesoMinG: fila.pesoMinG,
      pesoMaxG: fila.pesoMaxG,
      rangoMinCop: fila.rangoMinCop,
      rangoMaxCop: fila.rangoMaxCop,
      diasMin: fila.diasMin,
      diasMax: fila.diasMax,
      contraentregaDisponible: fila.contraentregaDisponible,
      creado: fila.creado,
    }));
  }

  async registrarEventoFueraCobertura(evento: NuevoEventoFueraCobertura): Promise<void> {
    await this.prisma.eventoFueraCobertura.create({
      data: {
        productoId: evento.productoId,
        departamentoTexto: evento.departamentoTexto,
        ciudadTexto: evento.ciudadTexto,
        departamentoId: evento.departamentoId,
        ciudadId: evento.ciudadId,
      },
    });
  }
}
