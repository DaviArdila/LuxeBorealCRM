import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import type {
  EstadoTecho,
  RepositorioParametroLlm,
} from '../../puertos/repositorio-parametro-llm.js';

const CLAVE_MENSAJE_TECHO_GASTO = 'mensaje_techo_gasto';
const CLAVE_ESTADO_TECHO = 'llm_estado_techo';
const CLAVE_TECHO_MENSUAL_USD = 'llm_techo_mensual_usd';

/**
 * Texto por defecto (P22): neutro, no revela el límite de gasto y no promete una hora de respuesta.
 * El negocio lo reemplaza en `parametro.mensaje_techo_gasto` sin desplegar (R15).
 */
const MENSAJE_TECHO_GASTO_POR_DEFECTO =
  'Gracias por escribirnos. En este momento te atiende directamente un asesor, que te responderá en breve.';

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
 * forma nunca lanza: el texto cae al default y el estado se lee como ausente.
 */
@Injectable()
export class RepositorioParametroLlmPrisma implements RepositorioParametroLlm {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerMensajeTechoGasto(): Promise<string> {
    const fila = await this.prisma.parametro.findUnique({ where: { clave: CLAVE_MENSAJE_TECHO_GASTO } });
    const valor = fila?.valor;
    return typeof valor === 'string' && valor.trim().length > 0 ? valor : MENSAJE_TECHO_GASTO_POR_DEFECTO;
  }

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
