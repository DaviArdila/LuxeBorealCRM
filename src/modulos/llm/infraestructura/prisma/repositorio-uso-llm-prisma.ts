import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import {
  type FilaUsoLlm,
  type GastoPorModelo,
  type RepositorioUsoLlm,
} from '../../puertos/repositorio-uso-llm.js';

/**
 * Adaptador Prisma de {@link RepositorioUsoLlm} sobre `uso_llm`. `registrarUso` es best-effort
 * (LLM13): un fallo de la base se loguea y se sigue, para que la respuesta al cliente no se pierda
 * por no haber podido anotar su costo.
 */
@Injectable()
export class RepositorioUsoLlmPrisma implements RepositorioUsoLlm {
  private readonly logger = new Logger(RepositorioUsoLlmPrisma.name);

  constructor(private readonly prisma: PrismaService) {}

  async registrarUso(fila: FilaUsoLlm): Promise<void> {
    try {
      await this.prisma.usoLlm.create({
        data: {
          conversacionId: fila.conversacionId ?? null,
          proveedor: fila.proveedor,
          modelo: fila.modelo,
          tokensEntrada: fila.tokensEntrada,
          tokensSalida: fila.tokensSalida,
          tokensCache: fila.tokensCache,
          costoEstimadoUsd: fila.costoEstimadoUsd,
          latenciaMs: Math.round(fila.latenciaMs),
          exito: fila.exito,
        },
      });
    } catch (error) {
      // R14: solo el tipo de error; su mensaje puede traer valores de la fila (ids, montos).
      this.logger.error({
        evento: 'llm.uso-no-registrado',
        proveedor: fila.proveedor,
        modelo: fila.modelo,
        error: error instanceof Error ? error.name : 'desconocido',
      });
    }
  }

  async gastoMensual(desde: Date): Promise<number> {
    const agregado = await this.prisma.usoLlm.aggregate({
      _sum: { costoEstimadoUsd: true },
      where: { creado: { gte: desde } },
    });
    return agregado._sum.costoEstimadoUsd?.toNumber() ?? 0;
  }

  async gastoMensualPorModelo(desde: Date): Promise<readonly GastoPorModelo[]> {
    const grupos = await this.prisma.usoLlm.groupBy({
      by: ['proveedor', 'modelo'],
      _sum: { costoEstimadoUsd: true },
      where: { creado: { gte: desde } },
      orderBy: [{ proveedor: 'asc' }, { modelo: 'asc' }],
    });
    return grupos.map((grupo) => ({
      proveedor: grupo.proveedor,
      modelo: grupo.modelo,
      costoUsd: grupo._sum.costoEstimadoUsd?.toNumber() ?? 0,
    }));
  }
}
