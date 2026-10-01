import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../plataforma/prisma/index.js';
import { esAnguloFoto } from '../dominio/angulo-foto.js';
import type { FotoProducto, Producto, ProductoResumen } from '../dominio/producto.js';
import type { RepositorioProducto } from '../puertos/repositorio-producto.js';

/**
 * `id` de `producto` es `uuid` en Postgres (`prisma/schema.prisma`): pasarle un `sku` no-UUID como
 * filtro de igualdad de `id` lanza un error de sintaxis en la base, no un simple "sin resultados".
 * Este patrón descarta el filtro por `id` cuando `idOSku` no tiene forma de UUID.
 */
const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Adaptador Prisma del puerto {@link RepositorioProducto} (design.md, "Puertos y adaptadores"). */
@Injectable()
export class RepositorioProductoPrisma implements RepositorioProducto {
  constructor(private readonly prisma: PrismaService) {}

  async listarActivosResumen(): Promise<readonly ProductoResumen[]> {
    return this.prisma.producto.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, sku: true, nombre: true, descripcionCorta: true },
    });
  }

  async buscarPorIdOSku(idOSku: string): Promise<Producto | null> {
    const fila = await this.prisma.producto.findFirst({
      where: PATRON_UUID.test(idOSku) ? { OR: [{ id: idOSku }, { sku: idOSku }] } : { sku: idOSku },
      include: { _count: { select: { fotos: true } } },
    });
    if (!fila) return null;

    return {
      id: fila.id,
      sku: fila.sku,
      nombre: fila.nombre,
      descripcionCorta: fila.descripcionCorta,
      descripcionLarga: fila.descripcionLarga,
      precioCop: fila.precioCop,
      activo: fila.activo,
      pesoGramos: fila.pesoGramos,
      largoMm: fila.largoMm,
      anchoMm: fila.anchoMm,
      altoMm: fila.altoMm,
      tieneFotos: fila._count.fotos > 0,
    };
  }

  async listarFotos(productoId: string): Promise<readonly FotoProducto[]> {
    const filas = await this.prisma.foto.findMany({
      where: { productoId },
      orderBy: [{ esPortada: 'desc' }, { orden: 'asc' }],
      select: { claveArchivo: true, angulo: true },
    });
    return filas.map((fila) => ({
      claveObjeto: fila.claveArchivo,
      angulo: fila.angulo !== null && esAnguloFoto(fila.angulo) ? fila.angulo : null,
    }));
  }
}
