import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import type { RepositorioCasos } from '../../puertos/repositorio-casos.js';

/**
 * Adaptador Prisma de {@link RepositorioCasos} sobre `caso_asistente` (CAS7). Solo lee: la escritura de los casos llega
 * con la API (T7) y la de la semilla va por {@link RepositorioSemillaPrisma}.
 */
@Injectable()
export class RepositorioCasosPrisma implements RepositorioCasos {
  constructor(private readonly prisma: PrismaService) {}

  async leerTextosDelSistema(): Promise<ReadonlyMap<string, string>> {
    const filas = await this.prisma.casoAsistente.findMany({
      where: { claveSistema: { not: null }, activo: true },
      select: { claveSistema: true, texto: true },
    });
    return new Map(filas.flatMap((fila) => (fila.claveSistema === null ? [] : [[fila.claveSistema, fila.texto] as const])));
  }
}
