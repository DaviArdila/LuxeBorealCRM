import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../plataforma/prisma/index.js';
import { validarFactorVolumetrico } from '../dominio/envio.js';
import { MENSAJE_FUERA_COBERTURA_POR_DEFECTO } from '../dominio/textos-fijos.js';
import type { RepositorioParametroCatalogo } from '../puertos/repositorio-parametro.js';

/**
 * Adaptador Prisma del puerto {@link RepositorioParametroCatalogo} (design.md D4): lee `parametro`
 * por clave. Ningún caso "no configurado" lanza: cada método aplica su propio criterio de valor
 * por defecto, documentado aquí porque ninguna spec de esta fase lo fija.
 */
@Injectable()
export class RepositorioParametroCatalogoPrisma implements RepositorioParametroCatalogo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Si `factor_volumetrico` no existe o su forma no es un número positivo finito, se reutiliza
   * `validarFactorVolumetrico` del dominio (`FACTOR_VOLUMETRICO_POR_DEFECTO`, 4000): es el mismo
   * criterio de "forma inválida ⇒ valor por defecto" que ya usa el dominio, sin duplicarlo aquí.
   */
  async obtenerFactorVolumetrico(): Promise<number> {
    const fila = await this.prisma.parametro.findUnique({ where: { clave: 'factor_volumetrico' } });
    return validarFactorVolumetrico(fila?.valor);
  }

  /**
   * Si `mensaje_fuera_cobertura` no existe o no es un texto no vacío, se usa
   * {@link MENSAJE_FUERA_COBERTURA_POR_DEFECTO}: `CotizarEnvio` (T8) siempre tiene un mensaje que
   * citar al cliente, incluso antes de que el negocio configure el suyo propio.
   */
  async obtenerMensajeFueraCobertura(): Promise<string> {
    const fila = await this.prisma.parametro.findUnique({ where: { clave: 'mensaje_fuera_cobertura' } });
    const valor = fila?.valor;
    return typeof valor === 'string' && valor.trim().length > 0 ? valor : MENSAJE_FUERA_COBERTURA_POR_DEFECTO;
  }
}
