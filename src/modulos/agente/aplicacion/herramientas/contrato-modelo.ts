import type { ResultadoCotizacion, ResultadoPolitica } from '../../../catalogo/index.js';

/**
 * Único lugar donde los resultados de `catalogo` (camelCase, tipos del dominio) se traducen al
 * contrato snake_case que ve el modelo (nombres iguales a los del prototipo, D1 de la Fase 07b). Solo
 * renombra: nunca calcula, redondea ni reformatea un valor (R2).
 */
export function cotizacionParaElModelo(cotizacion: ResultadoCotizacion): Record<string, unknown> {
  if (!cotizacion.cobertura) {
    return { cobertura: false, mensaje_sin_cobertura: cotizacion.mensaje };
  }
  return {
    cobertura: true,
    rango_texto: cotizacion.rangoTexto,
    dias_texto: cotizacion.diasTexto,
    contraentrega_disponible: cotizacion.contraentregaDisponible,
    ...(cotizacion.politicaContraentregaTexto === undefined
      ? {}
      : { politica_contraentrega_texto: cotizacion.politicaContraentregaTexto }),
  };
}

export function politicaParaElModelo(politica: ResultadoPolitica): Record<string, unknown> {
  return politica.encontrada
    ? { encontrada: true, texto: politica.texto }
    : { encontrada: false, temas_disponibles: politica.temasDisponibles };
}
