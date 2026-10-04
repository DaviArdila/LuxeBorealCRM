import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import { TEXTOS_DE_RESPALDO_AGENTE } from '../../dominio/textos-fijos.js';
import type { ClaveTextoAgente, RepositorioParametroAgente } from '../../puertos/repositorio-parametro-agente.js';

/**
 * Adaptador Prisma de {@link RepositorioParametroAgente} sobre `parametro` (D9). Una clave ausente, en
 * blanco o con un valor que no es texto nunca lanza: cae al respaldo, como los repositorios de
 * `conversaciones` y `llm`.
 */
@Injectable()
export class RepositorioParametroAgentePrisma implements RepositorioParametroAgente {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerTexto(clave: ClaveTextoAgente): Promise<string> {
    const fila = await this.prisma.parametro.findUnique({ where: { clave } });
    const valor = fila?.valor;
    return typeof valor === 'string' && valor.trim().length > 0 ? valor : TEXTOS_DE_RESPALDO_AGENTE[clave];
  }
}
