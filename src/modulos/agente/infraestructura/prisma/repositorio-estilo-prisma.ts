import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import type { EstiloGuardado, RepositorioEstilo } from '../../puertos/repositorio-estilo.js';

/** Claves de `parametro` del estilo editable (D1 de la Fase 08c). */
export const CLAVE_ESTILO = 'prompt_estilo';
export const CLAVE_ESTILO_VERSION = 'prompt_estilo_version';

/**
 * Adaptador Prisma de {@link RepositorioEstilo} sobre `parametro` (ADR-0020). Una clave ausente, en blanco o con
 * un valor que no es texto devuelve `null` y nunca lanza: rige el archivo de respaldo (AGT18). Un estilo editado a
 * mano sin versión se lee como versión 1.
 */
@Injectable()
export class RepositorioEstiloPrisma implements RepositorioEstilo {
  constructor(private readonly prisma: PrismaService) {}

  async leerVigente(): Promise<EstiloGuardado | null> {
    const filas = await this.prisma.parametro.findMany({ where: { clave: { in: [CLAVE_ESTILO, CLAVE_ESTILO_VERSION] } } });
    const texto = filas.find((fila) => fila.clave === CLAVE_ESTILO)?.valor;
    if (typeof texto !== 'string' || texto.trim().length === 0) {
      return null;
    }
    const version = filas.find((fila) => fila.clave === CLAVE_ESTILO_VERSION)?.valor;
    return { texto, version: typeof version === 'number' && Number.isInteger(version) && version > 0 ? version : 1 };
  }
}
