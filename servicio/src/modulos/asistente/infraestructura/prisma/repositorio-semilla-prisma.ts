import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import { CASOS_DEL_SISTEMA } from '../../dominio/sistema.js';
import { normalizarNombre, textoDeBusqueda } from '../../dominio/normalizar.js';
import { CASOS_INICIALES_DE_INTENCION, CLAVE_LEGADA_AVISO_DATOS, type PlanSemilla } from '../../dominio/semilla.js';
import type { RepositorioSemilla } from '../../puertos/repositorio-semilla.js';

const PREFIJO_POLITICA = 'politica_';

/**
 * Adaptador Prisma de {@link RepositorioSemilla} (CAS6). Es la única vía por la que `asistente` toca `parametro`: lee las
 * filas de texto y retira las que copió, en la misma transacción que crea los casos, para que el texto tenga un solo dueño.
 */
@Injectable()
export class RepositorioSemillaPrisma implements RepositorioSemilla {
  constructor(private readonly prisma: PrismaService) {}

  async leerParametrosDeTexto(): Promise<ReadonlyMap<string, unknown>> {
    const claves = [...CASOS_DEL_SISTEMA.map((caso) => caso.clave), ...CASOS_INICIALES_DE_INTENCION.map((caso) => caso.claveParametro)];
    const filas = await this.prisma.parametro.findMany({
      where: { OR: [{ clave: { in: claves } }, { clave: { startsWith: PREFIJO_POLITICA } }] },
    });
    return new Map(filas.map((fila) => [fila.clave, fila.valor]));
  }

  async leerTextoLegadoDelAviso(): Promise<unknown> {
    const fila = await this.prisma.casoAsistente.findUnique({ where: { claveSistema: CLAVE_LEGADA_AVISO_DATOS }, select: { texto: true } });
    return fila?.texto ?? null;
  }

  async aplicar(plan: PlanSemilla, ahora: Date): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const categorias = new Map<string, string>();
      for (const { nombre, orden } of plan.categorias) {
        const normalizado = normalizarNombre(nombre);
        const existente = await tx.categoriaCaso.findUnique({ where: { nombreNormalizado: normalizado } });
        const categoria =
          existente ??
          (await tx.categoriaCaso.create({
            data: { nombre, nombreNormalizado: normalizado, orden, creado: ahora, actualizado: ahora },
          }));
        categorias.set(nombre, categoria.id);
      }

      let insertados = 0;
      const copiadas: string[] = [];
      for (const caso of plan.casos) {
        const tituloNormalizado = normalizarNombre(caso.titulo);
        const existente = await tx.casoAsistente.findFirst({
          where: {
            OR: [{ tituloNormalizado }, ...(caso.claveSistema === null ? [] : [{ claveSistema: caso.claveSistema }])],
          },
          select: { id: true },
        });
        if (existente !== null) continue;
        const categoriaId = categorias.get(caso.categoria);
        if (categoriaId === undefined) throw new Error(`la categoría «${caso.categoria}» no está en el plan`);
        await tx.casoAsistente.create({
          data: {
            categoriaId,
            titulo: caso.titulo,
            tituloNormalizado,
            cuandoAplica: caso.cuandoAplica,
            disparador: caso.disparador,
            claveSistema: caso.claveSistema,
            modo: caso.modo,
            texto: caso.texto,
            activo: true,
            busquedaNormalizada: textoDeBusqueda(caso),
            creado: ahora,
            actualizado: ahora,
          },
        });
        insertados += 1;
        if (caso.claveParametro !== null) copiadas.push(caso.claveParametro);
      }

      if (copiadas.length > 0) {
        await tx.parametro.deleteMany({ where: { clave: { in: copiadas } } });
      }
      return insertados;
    });
  }
}
