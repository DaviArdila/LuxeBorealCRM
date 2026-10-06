import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import type {
  EstadoTecho,
  RepositorioParametroLlm,
} from '../../puertos/repositorio-parametro-llm.js';

const CLAVE_ESTADO_TECHO = 'llm_estado_techo';
const CLAVE_TECHO_MENSUAL_USD = 'llm_techo_mensual_usd';

function esEstadoTecho(valor: unknown): valor is EstadoTecho {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const candidato = valor as Record<string, unknown>;
  return (
    typeof candidato['mes'] === 'string' &&
    typeof candidato['gastoUsd'] === 'number' &&
    typeof candidato['techoUsd'] === 'number' &&
    typeof candidato['avisoEmitido'] === 'boolean' &&
    typeof candidato['bloqueado'] === 'boolean'
  );
}

/**
 * Adaptador Prisma de {@link RepositorioParametroLlm} sobre `parametro`. «No configurado» o con otra
 * forma nunca lanza: el techo cae al del entorno y el estado se lee como ausente.
 */
@Injectable()
export class RepositorioParametroLlmPrisma implements RepositorioParametroLlm {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerTechoMensualUsd(): Promise<number | null> {
    const fila = await this.prisma.parametro.findUnique({ where: { clave: CLAVE_TECHO_MENSUAL_USD } });
    return typeof fila?.valor === 'number' ? fila.valor : null;
  }

  async leerEstadoTecho(): Promise<EstadoTecho | null> {
    const fila = await this.prisma.parametro.findUnique({ where: { clave: CLAVE_ESTADO_TECHO } });
    return esEstadoTecho(fila?.valor) ? fila.valor : null;
  }

  async guardarEstadoTecho(estado: EstadoTecho): Promise<void> {
    const valor = { ...estado };
    await this.prisma.parametro.upsert({
      where: { clave: CLAVE_ESTADO_TECHO },
      create: { clave: CLAVE_ESTADO_TECHO, valor },
      update: { valor },
    });
  }
}
