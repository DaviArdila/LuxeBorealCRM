const OMITIDO = '[dato omitido]';

const CORREO = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const DIRECCION =
  /\b(?:calle|carrera|cra|cr|kr|avenida|av|diagonal|diag|transversal|tv|cll|cl)\.?\s*\d+[a-z]?(?:\s*(?:bis|sur|norte|este|oeste))?\s*(?:#|no\.?|n°|nro\.?)\s*\d+[a-z]?\s*[-–]\s*\d+/gi;
const SECUENCIA_DE_DIGITOS = /\+?\d(?:[\s.\-–]*\d)+/g;
const DIGITOS_MINIMOS = 7;

/**
 * Redacta el resumen de un lead antes de guardarlo (D3 de la Fase 08, R14, P15, LDS2): el LLM escribe el
 * resumen y podría copiar un dato del cliente, así que se omiten correos, direcciones con nomenclatura y
 * cualquier secuencia de siete o más dígitos (teléfonos, cédulas), aunque vengan separados por espacios,
 * puntos o guiones. Falla cerrado: una cifra larga legítima (p. ej. un presupuesto de $1.500.000) también
 * se omite. Los precios cortos y las cantidades se conservan.
 */
export function redactarResumen(resumen: string): string {
  return resumen
    .replace(CORREO, OMITIDO)
    .replace(DIRECCION, OMITIDO)
    .replace(SECUENCIA_DE_DIGITOS, (secuencia) =>
      secuencia.replace(/\D/g, '').length >= DIGITOS_MINIMOS ? OMITIDO : secuencia,
    )
    .trim();
}
