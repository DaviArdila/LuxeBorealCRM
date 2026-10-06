import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../plataforma/prisma/index.js';
import { validarFactorVolumetrico } from '../dominio/envio.js';
import type { RepositorioParametroCatalogo } from '../puertos/repositorio-parametro.js';

/**
 * Adaptador Prisma del puerto {@link RepositorioParametroCatalogo} (design.md D4): lee `parametro`
 * por clave. Ningún caso "no configurado" lanza: cada método aplica su propio criterio de valor
 * por defecto, documentado aquí porque ninguna spec de esta fase lo fija.
 */
@Injectable()
export class RepositorioParametroCatalogoPrisma implements RepositorioParametroCatalogo {
  private readonly logger = new Logger(RepositorioParametroCatalogoPrisma.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Si `factor_volumetrico` no existe o su forma no es un número positivo finito, se reutiliza
   * `validarFactorVolumetrico` del dominio (`FACTOR_VOLUMETRICO_POR_DEFECTO`, 4000): es el mismo
   * criterio de "forma inválida ⇒ valor por defecto" que ya usa el dominio, sin duplicarlo aquí.
   */
  async obtenerFactorVolumetrico(): Promise<number> {
    const fila = await this.prisma.parametro.findUnique({ where: { clave: 'factor_volumetrico' } });
    const factor = validarFactorVolumetrico(fila?.valor);
    // CFG6: una fila con el tipo equivocado rige el valor por defecto, pero se avisa (sin el valor guardado, R14).
    if (fila !== null && factor !== fila.valor) {
      this.logger.warn({ evento: 'catalogo.parametro-invalido', clave: 'factor_volumetrico', aplicado: 'valor-por-defecto' });
    }
    return factor;
  }
}
