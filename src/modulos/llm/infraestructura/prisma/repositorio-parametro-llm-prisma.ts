import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import type {
  EstadoTecho,
  RepositorioParametroLlm,
} from '../../puertos/repositorio-parametro-llm.js';

const CLAVE_MENSAJE_TECHO_GASTO = 'mensaje_techo_gasto';
const CLAVE_ESTADO_TECHO = 'llm_estado_techo';

/**
 * Sin texto real de negocio todavía (pendiente de que el usuario lo cargue, R15; mismo criterio que
 * `mensaje_espera_handoff`): el negocio lo cambia en `parametro` sin desplegar.
 */
const MENSAJE_TECHO_GASTO_POR_DEFECTO =
  'Estamos con alta demanda en este momento. Te derivo con un asesor que te atiende enseguida.';

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
