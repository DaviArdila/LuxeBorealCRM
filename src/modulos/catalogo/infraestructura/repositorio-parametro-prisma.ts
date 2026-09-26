import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../plataforma/prisma/index.js';
import { validarFactorVolumetrico } from '../dominio/envio.js';
import type { RepositorioParametroCatalogo } from '../puertos/repositorio-parametro.js';

/** `parametro.valor` sin recargo configurado: 0 % (ningún cargo adicional a lo cotizado). */
const RECARGO_CONTRAENTREGA_POR_DEFECTO_PCT = 0;

/**
 * Mensaje de fuera de cobertura cuando `parametro.mensaje_fuera_cobertura` no existe o no es un
 * texto no vacío: ningún dato de negocio se pierde (R15 sigue permitiendo sobrescribirlo desde
 * `parametro`), solo evita que `CotizarEnvio` (T8) se quede sin texto que citar al cliente.
 */
const MENSAJE_FUERA_COBERTURA_POR_DEFECTO =
  'Por ahora no tenemos cobertura de envío para tu ciudad. Un asesor revisará tu caso y te contactará.';

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
   * Si `recargo_contraentrega_pct` no existe o su forma no es un número finito entre 0 y 100
   * (inclusive), se asume 0 % — "no configurado" se trata igual que "sin recargo", nunca se
   * inventa un porcentaje de negocio que ninguna spec pidió.
   */
  async obtenerRecargoContraentregaPct(): Promise<number> {
    const fila = await this.prisma.parametro.findUnique({ where: { clave: 'recargo_contraentrega_pct' } });
    const valor = fila?.valor;
    return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor <= 100
      ? valor
      : RECARGO_CONTRAENTREGA_POR_DEFECTO_PCT;
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
