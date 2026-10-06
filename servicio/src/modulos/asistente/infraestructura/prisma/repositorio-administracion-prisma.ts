import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import type { CasoAdmin, Categoria, ConsultaListado } from '../../dominio/administracion.js';
import { textoDeBusqueda } from '../../dominio/normalizar.js';
import type {
  DatosCasoEscribible,
  DatosCasoNuevo,
  RepositorioAdministracion,
} from '../../puertos/repositorio-administracion.js';

const CODIGO_UNICO_VIOLADO = 'P2002';
const CODIGO_FILA_AUSENTE = 'P2025';

/** Duck-typing del código de Prisma (como `RepositorioEventoEntrantePrisma`): no necesita el namespace del cliente generado. */
function esErrorDePrisma(error: unknown, codigo: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { readonly code?: unknown }).code === codigo;
}

interface FilaConCategoria {
  readonly id: string;
  readonly categoriaId: string;
  readonly titulo: string;
  readonly cuandoAplica: string;
  readonly texto: string;
  readonly modo: 'literal' | 'guia';
  readonly disparador: 'evento' | 'intencion';
  readonly claveSistema: string | null;
  readonly activo: boolean;
  readonly creado: Date;
  readonly actualizado: Date;
  readonly categoria: { readonly nombre: string; readonly orden: number };
}

/**
 * `contains` de Prisma pasa el valor a un `LIKE` sin escapar `%`, `_` ni `\`: una búsqueda con comodines listaría todo. Se
 * escapan con la barra invertida, que es el escape por defecto de `LIKE` en Postgres.
 */
function escaparComodines(valor: string): string {
  return valor.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

const CON_CATEGORIA = { categoria: { select: { nombre: true, orden: true } } } as const;

function aCasoAdmin(fila: FilaConCategoria): CasoAdmin {
  return {
    id: fila.id,
    categoriaId: fila.categoriaId,
    categoriaNombre: fila.categoria.nombre,
    categoriaOrden: fila.categoria.orden,
    titulo: fila.titulo,
    cuandoAplica: fila.cuandoAplica,
    texto: fila.texto,
    modo: fila.modo,
    disparador: fila.disparador,
    claveSistema: fila.claveSistema,
    activo: fila.activo,
    creado: fila.creado,
    actualizado: fila.actualizado,
  };
}

/**
 * Adaptador Prisma de {@link RepositorioAdministracion} sobre `categoria_caso` y `caso_asistente` (CAS2, CAS3, CAS9, CAS10).
 * La unicidad de nombres y títulos (CAS1) la impone la base: un `P2002` es un `duplicada` limpio, también entre dos admins
 * simultáneos. Editar usa un bloqueo optimista por `actualizado` (CAS3). Nunca escribe un texto en logs (R14).
 */
@Injectable()
export class RepositorioAdministracionPrisma implements RepositorioAdministracion {
  constructor(private readonly prisma: PrismaService) {}

  async listarCategorias(): Promise<readonly Categoria[]> {
    const filas = await this.prisma.categoriaCaso.findMany({
      orderBy: [{ orden: 'asc' }, { nombreNormalizado: 'asc' }],
      include: { _count: { select: { casos: true } } },
    });
    return filas.map((fila) => ({ id: fila.id, nombre: fila.nombre, orden: fila.orden, totalCasos: fila._count.casos }));
  }

  async crearCategoria(nombre: string, nombreNormalizado: string, ahora: Date): Promise<Categoria | 'duplicada'> {
    try {
      const mayor = await this.prisma.categoriaCaso.aggregate({ _max: { orden: true } });
      const fila = await this.prisma.categoriaCaso.create({
        data: { nombre, nombreNormalizado, orden: (mayor._max.orden ?? -1) + 1, creado: ahora, actualizado: ahora },
      });
      return { id: fila.id, nombre: fila.nombre, orden: fila.orden, totalCasos: 0 };
    } catch (error) {
      if (esErrorDePrisma(error, CODIGO_UNICO_VIOLADO)) return 'duplicada';
      throw error;
    }
  }

  async renombrarCategoria(id: string, nombre: string, nombreNormalizado: string, ahora: Date): Promise<Categoria | 'inexistente' | 'duplicada'> {
    try {
      const fila = await this.prisma.categoriaCaso.update({
        where: { id },
        data: { nombre, nombreNormalizado, actualizado: ahora },
        include: { _count: { select: { casos: true } } },
      });
      return { id: fila.id, nombre: fila.nombre, orden: fila.orden, totalCasos: fila._count.casos };
    } catch (error) {
      if (esErrorDePrisma(error, CODIGO_FILA_AUSENTE)) return 'inexistente';
      if (esErrorDePrisma(error, CODIGO_UNICO_VIOLADO)) return 'duplicada';
      throw error;
    }
  }

  async ordenarCategorias(ids: readonly string[], ahora: Date): Promise<readonly Categoria[] | 'no-coincide'> {
    const coincide = await this.prisma.$transaction(async (tx) => {
      const existentes = (await tx.categoriaCaso.findMany({ select: { id: true } })).map((fila) => fila.id).sort();
      const pedidas = [...ids].sort();
      if (existentes.length !== pedidas.length || existentes.some((id, i) => id !== pedidas[i])) return false;
      for (const [orden, id] of ids.entries()) {
        await tx.categoriaCaso.update({ where: { id }, data: { orden, actualizado: ahora } });
      }
      return true;
    });
    return coincide ? this.listarCategorias() : 'no-coincide';
  }

  async borrarCategoria(id: string): Promise<'borrada' | 'inexistente' | 'con-casos'> {
    return this.prisma.$transaction(async (tx) => {
      const fila = await tx.categoriaCaso.findUnique({ where: { id }, select: { id: true } });
      if (fila === null) return 'inexistente';
      if ((await tx.casoAsistente.count({ where: { categoriaId: id } })) > 0) return 'con-casos';
      await tx.categoriaCaso.delete({ where: { id } });
      return 'borrada';
    });
  }

  async listarCasos(consulta: ConsultaListado): Promise<readonly CasoAdmin[]> {
    const { despues } = consulta;
    const filas = await this.prisma.casoAsistente.findMany({
      where: {
        AND: [
          consulta.qNormalizada === null ? {} : { busquedaNormalizada: { contains: escaparComodines(consulta.qNormalizada) } },
          consulta.categoriaId === null ? {} : { categoriaId: consulta.categoriaId },
          consulta.disparador === null ? {} : { disparador: consulta.disparador },
          consulta.activo === null ? {} : { activo: consulta.activo },
          despues === null
            ? {}
            : {
                OR: [
                  { categoria: { orden: { gt: despues.ordenCategoria } } },
                  { categoria: { orden: despues.ordenCategoria }, tituloNormalizado: { gt: despues.tituloNormalizado } },
                  { categoria: { orden: despues.ordenCategoria }, tituloNormalizado: despues.tituloNormalizado, id: { gt: despues.id } },
                ],
              },
        ],
      },
      orderBy: [{ categoria: { orden: 'asc' } }, { tituloNormalizado: 'asc' }, { id: 'asc' }],
      take: consulta.limite + 1,
      include: CON_CATEGORIA,
    });
    return filas.map(aCasoAdmin);
  }

  async obtenerCaso(id: string): Promise<CasoAdmin | null> {
    const fila = await this.prisma.casoAsistente.findUnique({ where: { id }, include: CON_CATEGORIA });
    return fila === null ? null : aCasoAdmin(fila);
  }

  async crearCaso(datos: DatosCasoNuevo, ahora: Date): Promise<CasoAdmin | 'categoria-inexistente' | 'duplicado'> {
    if ((await this.prisma.categoriaCaso.findUnique({ where: { id: datos.categoriaId }, select: { id: true } })) === null) {
      return 'categoria-inexistente';
    }
    try {
      const fila = await this.prisma.casoAsistente.create({
        data: {
          categoriaId: datos.categoriaId,
          titulo: datos.titulo,
          tituloNormalizado: datos.tituloNormalizado,
          cuandoAplica: datos.cuandoAplica,
          disparador: 'intencion',
          claveSistema: null,
          modo: datos.modo,
          texto: datos.texto,
          activo: datos.activo,
          busquedaNormalizada: textoDeBusqueda(datos),
          creado: ahora,
          actualizado: ahora,
        },
        include: CON_CATEGORIA,
      });
      return aCasoAdmin(fila);
    } catch (error) {
      if (esErrorDePrisma(error, CODIGO_UNICO_VIOLADO)) return 'duplicado';
      throw error;
    }
  }

  async editarCaso(
    id: string,
    datos: DatosCasoEscribible,
    actualizadoLeido: Date,
    ahora: Date,
  ): Promise<CasoAdmin | 'inexistente' | 'modificado' | 'duplicado' | 'categoria-inexistente'> {
    if ((await this.prisma.categoriaCaso.findUnique({ where: { id: datos.categoriaId }, select: { id: true } })) === null) {
      return 'categoria-inexistente';
    }
    try {
      const { count } = await this.prisma.casoAsistente.updateMany({
        where: { id, actualizado: actualizadoLeido },
        data: {
          categoriaId: datos.categoriaId,
          titulo: datos.titulo,
          tituloNormalizado: datos.tituloNormalizado,
          cuandoAplica: datos.cuandoAplica,
          modo: datos.modo,
          texto: datos.texto,
          activo: datos.activo,
          busquedaNormalizada: textoDeBusqueda(datos),
          actualizado: ahora,
        },
      });
      if (count === 0) {
        return (await this.prisma.casoAsistente.findUnique({ where: { id }, select: { id: true } })) === null ? 'inexistente' : 'modificado';
      }
    } catch (error) {
      if (esErrorDePrisma(error, CODIGO_UNICO_VIOLADO)) return 'duplicado';
      throw error;
    }
    const fila = await this.prisma.casoAsistente.findUniqueOrThrow({ where: { id }, include: CON_CATEGORIA });
    return aCasoAdmin(fila);
  }

  async borrarCaso(id: string): Promise<'borrado' | 'inexistente' | 'del-sistema'> {
    return this.prisma.$transaction(async (tx) => {
      const fila = await tx.casoAsistente.findUnique({ where: { id }, select: { claveSistema: true } });
      if (fila === null) return 'inexistente';
      if (fila.claveSistema !== null) return 'del-sistema';
      await tx.casoAsistente.delete({ where: { id } });
      return 'borrado';
    });
  }
}
