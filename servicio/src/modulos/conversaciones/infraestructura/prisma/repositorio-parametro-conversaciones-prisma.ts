import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import { MENSAJE_ESPERA_HANDOFF_POR_DEFECTO } from '../../dominio/textos-fijos.js';
import type { RepositorioParametroConversaciones } from '../../puertos/repositorio-parametro-conversaciones.js';

/**
 * Adaptador Prisma del puerto {@link RepositorioParametroConversaciones} (D13): lee `parametro` por
 * clave, mismo criterio que `RepositorioParametroCatalogoPrisma` — "no configurado" nunca lanza, se
 * usa el default embebido.
 */
@Injectable()
export class RepositorioParametroConversacionesPrisma implements RepositorioParametroConversaciones {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerMensajeEsperaHandoff(): Promise<string> {
    const fila = await this.prisma.parametro.findUnique({ where: { clave: 'mensaje_espera_handoff' } });
    const valor = fila?.valor;
    return typeof valor === 'string' && valor.trim().length > 0 ? valor : MENSAJE_ESPERA_HANDOFF_POR_DEFECTO;
  }
}
