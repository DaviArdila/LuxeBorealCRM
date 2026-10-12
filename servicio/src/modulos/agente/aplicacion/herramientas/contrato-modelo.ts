import { lineaDeIndice, type CasoDelPrompt, type ResultadoCaso } from '../../../asistente/index.js';
import type { FichaProducto, ResultadoCotizacion } from '../../../catalogo/index.js';

/**
 * Único lugar donde los resultados de `catalogo` (camelCase, tipos del dominio) se traducen al
 * contrato snake_case que ve el modelo (nombres iguales a los del prototipo, D1 de la Fase 07b). Solo
 * renombra: nunca calcula, redondea ni reformatea un valor (R2).
 */
export function cotizacionParaElModelo(cotizacion: ResultadoCotizacion): Record<string, unknown> {
  if (!cotizacion.cobertura) {
    return { cobertura: false };
  }
  return {
    cobertura: true,
    rango_texto: cotizacion.rangoTexto,
    dias_texto: cotizacion.diasTexto,
    contraentrega_disponible: cotizacion.contraentregaDisponible,
  };
}

/** La ficha que ve el modelo, igual venga de `obtener_ficha` o de `buscar_producto` (AGT8): sin SKU (AGT16). */
export function fichaParaElModelo(ficha: FichaProducto): Record<string, unknown> {
  return {
    id: ficha.id,
    nombre: ficha.nombre,
    descripcion_larga: ficha.descripcionLarga,
    precio_texto: ficha.precioTexto,
    tiene_fotos: ficha.tieneFotos,
    angulos_fotos: ficha.angulosFotos,
  };
}

export function casoParaElModelo(caso: ResultadoCaso): Record<string, unknown> {
  return caso.encontrado
    ? { encontrado: true, titulo: caso.titulo, modo: caso.modo, texto: caso.texto }
    : { encontrado: false, titulos_disponibles: caso.titulosDisponibles };
}

/**
 * Un caso dentro del prompt (CAS8): su línea del índice y, debajo, exactamente lo que devolvería `consultar_caso`, así
 * `literal` y `guia` se presentan igual por las dos vías y la regla 3 de seguridad rige sin cambios.
 */
export function casoEnPrompt(caso: CasoDelPrompt): string {
  const resultado = casoParaElModelo({ encontrado: true, titulo: caso.titulo, modo: caso.modo, texto: caso.texto });
  return `${lineaDeIndice(caso)}\n  ${JSON.stringify(resultado)}`;
}
