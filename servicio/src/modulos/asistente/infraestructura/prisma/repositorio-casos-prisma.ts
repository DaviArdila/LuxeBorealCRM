import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import { normalizarNombre, textoDeBusqueda } from '../../dominio/normalizar.js';
import { CATEGORIAS_INICIALES, definicionDe, type ClaveSistema } from '../../dominio/sistema.js';
import type { CasoDeIntencion, CasoDelSistema, RepositorioCasos } from '../../puertos/repositorio-casos.js';

/** Lo que `crear` usa de la transacción: las dos tablas del asistente. */
type Transaccion = Pick<PrismaService, 'categoriaCaso' | 'casoAsistente'>;

/**
 * Adaptador Prisma de {@link RepositorioCasos} sobre `caso_asistente` (CAS4, CAS7). Los casos de intención y las categorías
 * las administra la API de T7; la semilla va por {@link RepositorioSemillaPrisma}.
 */
@Injectable()
export class RepositorioCasosPrisma implements RepositorioCasos {
  constructor(private readonly prisma: PrismaService) {}

  async leerTextosDelSistema(): Promise<ReadonlyMap<string, string>> {
    const casos = await this.leerCasosDelSistema();
    return new Map([...casos].map(([clave, caso]) => [clave, caso.texto]));
  }

  async leerCasosDeIntencion(): Promise<readonly CasoDeIntencion[]> {
    const filas = await this.prisma.casoAsistente.findMany({
      where: { disparador: 'intencion', activo: true },
      orderBy: [{ categoria: { orden: 'asc' } }, { tituloNormalizado: 'asc' }],
      select: { titulo: true, tituloNormalizado: true, cuandoAplica: true, modo: true, texto: true },
    });
    return filas;
  }

  async leerCasosDelSistema(): Promise<ReadonlyMap<string, CasoDelSistema>> {
    const filas = await this.prisma.casoAsistente.findMany({
      where: { claveSistema: { not: null } },
      select: { claveSistema: true, texto: true, actualizado: true },
    });
    return new Map(
      filas.flatMap((fila) =>
        fila.claveSistema === null ? [] : [[fila.claveSistema, { texto: fila.texto, actualizado: fila.actualizado }] as const],
      ),
    );
  }

  async guardarTextoDelSistema(clave: ClaveSistema, texto: string, ahora: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const caso = await tx.casoAsistente.findUnique({ where: { claveSistema: clave } });
      if (caso === null) {
        await this.crear(tx, clave, texto, ahora);
        return;
      }
      await tx.casoAsistente.update({
        where: { id: caso.id },
        data: {
          texto,
          busquedaNormalizada: textoDeBusqueda({ titulo: caso.titulo, cuandoAplica: caso.cuandoAplica, texto }),
          actualizado: ahora,
        },
      });
    });
  }

  async crearTextoDelSistemaSiFalta(clave: ClaveSistema, texto: string, ahora: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      if ((await tx.casoAsistente.findUnique({ where: { claveSistema: clave }, select: { id: true } })) !== null) return false;
      await this.crear(tx, clave, texto, ahora);
      return true;
    });
  }

  /** Crea el caso con el título, la descripción y la categoría de la lista cerrada, creando la categoría si falta. */
  private async crear(tx: Transaccion, clave: ClaveSistema, texto: string, ahora: Date): Promise<void> {
    const definicion = definicionDe(clave);
    const categoria = CATEGORIAS_INICIALES.find((c) => c.nombre === definicion.categoriaInicial);
    const nombre = definicion.categoriaInicial;
    const nombreNormalizado = normalizarNombre(nombre);
    const existente = await tx.categoriaCaso.findUnique({ where: { nombreNormalizado } });
    const categoriaId =
      existente?.id ??
      (
        await tx.categoriaCaso.create({
          data: { nombre, nombreNormalizado, orden: categoria?.orden ?? 0, creado: ahora, actualizado: ahora },
        })
      ).id;
    await tx.casoAsistente.create({
      data: {
        categoriaId,
        titulo: definicion.titulo,
        tituloNormalizado: normalizarNombre(definicion.titulo),
        cuandoAplica: definicion.descripcion,
        disparador: definicion.disparador,
        claveSistema: clave,
        modo: 'literal',
        texto,
        activo: true,
        busquedaNormalizada: textoDeBusqueda({ titulo: definicion.titulo, cuandoAplica: definicion.descripcion, texto }),
        creado: ahora,
        actualizado: ahora,
      },
    });
  }
}
