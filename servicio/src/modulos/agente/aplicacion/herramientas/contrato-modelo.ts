import type { ResultadoCaso } from '../../../asistente/index.js';
import type { ResultadoCotizacion } from '../../../catalogo/index.js';

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

export function casoParaElModelo(caso: ResultadoCaso): Record<string, unknown> {
  return caso.encontrado
    ? { encontrado: true, titulo: caso.titulo, modo: caso.modo, texto: caso.texto }
    : { encontrado: false, titulos_disponibles: caso.titulosDisponibles };
}
