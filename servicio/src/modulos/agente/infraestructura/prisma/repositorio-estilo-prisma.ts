import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import {
  MAX_VERSIONES_HISTORIAL,
  type AutorEstilo,
  type EstiloGuardado,
  type RepositorioEstilo,
  type VersionHistorial,
} from '../../puertos/repositorio-estilo.js';

/** Clave del candado consultivo que serializa las publicaciones (no es una clave de `parametro`). */
const CLAVE_CANDADO = 'version_estilo';

interface FilaVersion {
  readonly version: number;
  readonly texto: string;
  readonly publicadoEn: Date;
  readonly publicadoPorId: string | null;
  readonly publicadoPorNombre: string | null;
}

/** El autor, si la fila lo guarda; sin él (el comando `prompt:estilo`) no hay `publicadoPor`. */
function autorDe(fila: FilaVersion): { readonly publicadoPor?: AutorEstilo } {
  return fila.publicadoPorId !== null && fila.publicadoPorNombre !== null
    ? { publicadoPor: { id: fila.publicadoPorId, nombre: fila.publicadoPorNombre } }
    : {};
}

/**
 * Adaptador Prisma de {@link RepositorioEstilo} sobre `version_estilo` (EST-D1, ADR-0024). Una tabla vacía o un
 * texto en blanco devuelve `null` y nunca lanza: rige el archivo de respaldo (AGT18). La fecha de una versión del
 * historial es cuándo **dejó de regir** (AGT21): la de publicación de la siguiente.
 */
@Injectable()
export class RepositorioEstiloPrisma implements RepositorioEstilo {
  constructor(private readonly prisma: PrismaService) {}

  async leerVigente(): Promise<EstiloGuardado | null> {
    const fila = await this.prisma.versionEstilo.findFirst({ where: { vigente: true } });
    if (fila === null || fila.texto.trim().length === 0) {
      return null;
    }
    return { texto: fila.texto, version: fila.version, ...autorDe(fila) };
  }

  async leerHistorial(): Promise<readonly VersionHistorial[]> {
    const filas = await this.prisma.versionEstilo.findMany({ orderBy: { version: 'asc' } });
    return filas
      .map((fila, indice) => ({ fila, siguiente: filas[indice + 1] }))
      .filter(({ fila }) => !fila.vigente)
      .map(({ fila, siguiente }) => ({
        version: fila.version,
        texto: fila.texto,
        fecha: (siguiente?.publicadoEn ?? fila.publicadoEn).toISOString(),
        ...autorDe(fila),
      }))
      .reverse();
  }

  /**
   * Una transacción con un candado consultivo serializa a quienes publican a la vez (si no, dos lecturas de la
   * misma versión repetirían el número); como la primera publicación aún no tiene filas que bloquear, el candado
   * es por clave y no por fila. Pasa la vigente a no vigente, inserta la nueva y poda lo que exceda el historial.
   */
  async publicar(texto: string, fecha: Date, autor?: AutorEstilo | null): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CLAVE_CANDADO}))`;
      const mayor = await tx.versionEstilo.aggregate({ _max: { version: true } });
      const nueva = (mayor._max.version ?? 0) + 1;

      await tx.versionEstilo.updateMany({ where: { vigente: true }, data: { vigente: false } });
      await tx.versionEstilo.create({
        data: {
          version: nueva,
          texto,
          vigente: true,
          publicadoEn: fecha,
          publicadoPorId: autor?.id ?? null,
          publicadoPorNombre: autor?.nombre ?? null,
        },
      });

      const sobrantes = await tx.versionEstilo.findMany({
        where: { vigente: false },
        orderBy: { version: 'desc' },
        skip: MAX_VERSIONES_HISTORIAL,
        select: { id: true },
      });
      if (sobrantes.length > 0) {
        await tx.versionEstilo.deleteMany({ where: { id: { in: sobrantes.map((fila) => fila.id) } } });
      }
      return nueva;
    });
  }
}
