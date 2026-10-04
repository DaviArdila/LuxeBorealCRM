import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import type { FilaMensajeFijo, RepositorioMensajesFijos } from '../../puertos/repositorio-mensajes-fijos.js';

/**
 * Adaptador Prisma de {@link RepositorioMensajesFijos} sobre `parametro` (D3). `actualizado` se escribe a mano con el
 * instante del `Clock` de quien llama: la tabla no tiene `@updatedAt`.
 */
@Injectable()
export class RepositorioMensajesFijosPrisma implements RepositorioMensajesFijos {
  constructor(private readonly prisma: PrismaService) {}

  async leer(claves: readonly string[]): Promise<ReadonlyMap<string, FilaMensajeFijo>> {
    const filas = await this.prisma.parametro.findMany({ where: { clave: { in: [...claves] } } });
    return new Map(filas.map((fila) => [fila.clave, { valor: fila.valor, actualizado: fila.actualizado }]));
  }

  async guardar(clave: string, texto: string, ahora: Date): Promise<void> {
    await this.prisma.parametro.upsert({
      where: { clave },
      create: { clave, valor: texto, actualizado: ahora },
      update: { valor: texto, actualizado: ahora },
    });
  }

  async insertarFaltantes(mensajes: readonly { clave: string; texto: string }[], ahora: Date): Promise<number> {
    const resultado = await this.prisma.parametro.createMany({
      data: mensajes.map(({ clave, texto }) => ({ clave, valor: texto, actualizado: ahora })),
      skipDuplicates: true,
    });
    return resultado.count;
  }
}
