import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../plataforma/prisma/index.js';
import { claveDeTema, temaDeClave } from '../dominio/politica.js';
import type { RepositorioPolitica } from '../puertos/repositorio-politica.js';

/**
 * Adaptador Prisma del puerto {@link RepositorioPolitica}: lee las filas `politica_*` de
 * `parametro`. Una fila cuyo valor no es un texto no vacío se ignora (el importador nunca la
 * escribe así, pero la tabla admite cualquier jsonb).
 */
@Injectable()
export class RepositorioPoliticaPrisma implements RepositorioPolitica {
  constructor(private readonly prisma: PrismaService) {}

  async obtener(tema: string): Promise<string | null> {
    const fila = await this.prisma.parametro.findUnique({ where: { clave: claveDeTema(tema) } });
    return typeof fila?.valor === 'string' && fila.valor.trim() !== '' ? fila.valor : null;
  }

  async listarTemas(): Promise<string[]> {
    const filas = await this.prisma.parametro.findMany({
      where: { clave: { startsWith: claveDeTema('') } },
      select: { clave: true, valor: true },
    });
    return filas
      .filter((fila) => typeof fila.valor === 'string' && fila.valor.trim() !== '')
      .map((fila) => temaDeClave(fila.clave));
  }
}
