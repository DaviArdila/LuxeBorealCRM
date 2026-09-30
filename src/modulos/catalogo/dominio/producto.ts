/**
 * Tipos y funciones puras del dominio de producto (design.md D6): arma la ficha con el dinero ya
 * formateado (CAT2, R2 — el LLM nunca calcula dinero, solo cita lo que el backend formateó) y el
 * texto del catálogo compacto sin precios (CAT4). Solo importa `compartido/dinero`, permitido por
 * la regla `dominio-aislado` (skill `luxeboreal-arquitectura` §2); nunca NestJS ni Prisma.
 */
import { formatearCop } from '../../../compartido/dinero/index.js';

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
  readonly tieneFotos: boolean;
}

/**
 * Claves de objeto (MED1) de las imágenes de un producto, nunca rutas ni URLs (CAT14): el collage si el
 * importador lo generó y las fotos individuales en orden de envío (portada primero).
 */
export interface FotosProducto {
  readonly claveCollage: string | null;
  readonly clavesFotos: readonly string[];
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
 * ningún valor, solo llama a los formateadores de `compartido/dinero`. La ficha no expone el recargo
 * contra entrega (CAT2): lo que el cliente debe saber lo entrega la política `contra_entrega`.
 */
export function armarFicha(producto: Producto): FichaProducto {
  return {
    id: producto.id,
    sku: producto.sku,
    nombre: producto.nombre,
    descripcionLarga: producto.descripcionLarga,
    precioTexto: formatearCop(producto.precioCop),
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
