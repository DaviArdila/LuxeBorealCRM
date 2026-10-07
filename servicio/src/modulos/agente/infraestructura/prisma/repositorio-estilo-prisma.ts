import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import { normalizarTexto } from '../../../../compartido/texto/index.js';
import { dividirEstilo } from '../../dominio/secciones-estilo.js';
import {
  type AutorEstilo,
  type EstiloGuardado,
  type RepositorioEstilo,
  type VersionHistorial,
} from '../../puertos/repositorio-estilo.js';
import { bloquearEstilo, guardarFotoDelEstilo } from './foto-estilo.js';

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
   * Una transacción con el candado del estilo serializa a quienes publican a la vez (si no, dos lecturas de la misma
   * versión repetirían el número). Guarda la foto con el texto tal cual (vigente, historial, poda) y reemplaza las secciones
   * por la división del texto por encabezados `# `, para que lo publicado por el comando o restaurado desde el historial
   * quede también como secciones. Las secciones nacen todas activas y con título único (`dividirEstilo`).
   */
  async publicar(texto: string, fecha: Date, autor?: AutorEstilo | null): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await bloquearEstilo(tx);
      const version = await guardarFotoDelEstilo(tx, texto, fecha, autor);
      await tx.seccionEstilo.deleteMany();
      await tx.seccionEstilo.createMany({
        data: dividirEstilo(texto).map((seccion, orden) => ({
          titulo: seccion.titulo,
          tituloNormalizado: normalizarTexto(seccion.titulo),
          texto: seccion.texto,
          orden,
          creado: fecha,
          actualizado: fecha,
        })),
      });
      return version;
    });
  }
}
