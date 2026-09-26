/**
 * Tipos y funciones puras del dominio de producto (design.md D6): arma la ficha con el dinero ya
 * formateado (CAT2, R2 — el LLM nunca calcula dinero, solo cita lo que el backend formateó) y el
 * texto del catálogo compacto sin precios (CAT4). Solo importa `compartido/dinero`, permitido por
 * la regla `dominio-aislado` (skill `luxeboreal-arquitectura` §2); nunca NestJS ni Prisma.
 */
import { formatearCop, formatearRecargoContraentrega } from '../../../compartido/dinero/index.js';

/** Resumen de producto sin dinero: lo que expone el listado y el catálogo compacto (CAT1, CAT4). */
export interface ProductoResumen {
  readonly id: string;
  readonly sku: string;
  readonly nombre: string;
  readonly descripcionCorta: string;
}

/** Producto completo, tal como lo entrega el repositorio para armar su ficha (CAT2). */
export interface Producto extends ProductoResumen {
  readonly descripcionLarga: string;
  readonly precioCop: number;
  readonly activo: boolean;
  readonly pesoGramos: number | null;
  readonly largoMm: number | null;
  readonly anchoMm: number | null;
  readonly altoMm: number | null;
  readonly tieneFotos: boolean;
}

/** Ficha de producto con el dinero ya formateado como texto (CAT2). */
export interface FichaProducto {
  readonly id: string;
  readonly sku: string;
  readonly nombre: string;
  readonly descripcionLarga: string;
  readonly precioTexto: string;
  readonly recargoContraentregaTexto: string;
  readonly tieneFotos: boolean;
}

/** Se lanza al pedir la ficha de un producto inexistente o inactivo (CAT3). */
export class ProductoNoDisponible extends Error {
  constructor(mensaje = 'producto no disponible') {
    super(mensaje);
    this.name = 'ProductoNoDisponible';
  }
}

/**
 * Arma la ficha de un producto con el dinero ya formateado (CAT2, D6): nunca calcula ni redondea
 * ningún valor, solo llama a los formateadores de `compartido/dinero`. El porcentaje de recargo
 * contraentrega llega ya leído del parámetro editable `recargo_contraentrega_pct` (R15) por la
 * capa de aplicación; esta función no lo lee ni lo asume.
 */
export function armarFicha(producto: Producto, recargoContraentregaPct: number): FichaProducto {
  return {
    id: producto.id,
    sku: producto.sku,
    nombre: producto.nombre,
    descripcionLarga: producto.descripcionLarga,
    precioTexto: formatearCop(producto.precioCop),
    recargoContraentregaTexto: formatearRecargoContraentrega(recargoContraentregaPct),
    tieneFotos: producto.tieneFotos,
  };
}

/**
 * Texto compacto sku + nombre + descripción corta, una línea por producto, ordenado por nombre y
 * sin ningún valor de dinero (CAT4). Recibe únicamente resúmenes ya filtrados a productos activos:
 * excluir los inactivos es responsabilidad del repositorio/aplicación (CAT1), no de esta función.
 */
export function armarCatalogoCompacto(productos: readonly ProductoResumen[]): string {
  return [...productos]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((p) => `- ${p.sku}: ${p.nombre} — ${p.descripcionCorta}`)
    .join('\n');
}
