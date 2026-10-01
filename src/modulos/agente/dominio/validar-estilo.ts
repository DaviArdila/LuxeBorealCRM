/**
 * Validación pura del estilo del agente antes de publicarlo (AGT20, D4 de la Fase 08c). El estilo viaja en
 * todos los mensajes y no puede traer dinero (R1, R2), SKU (AGT16) ni marcadores de la plantilla del turno.
 * El tope de caracteres es una constante de código (ADR-0020): atrapa un descuido y evita que el estilo
 * compita con las reglas; subirlo después no invalida nada.
 */
export const MAX_CARACTERES_ESTILO = 4000;

const PATRON_PESOS = /\$\s?\d/;
const PATRON_SKU = /\bSKU-[A-Z0-9]+\b/i;
const PATRON_PLANTILLA = /\{\{|\}\}/;

export type ResultadoValidacionEstilo = { readonly valido: true } | { readonly valido: false; readonly motivo: string };

/** El motivo nombra la regla rota, nunca copia el texto (R14). */
export function validarEstilo(texto: string): ResultadoValidacionEstilo {
  if (texto.trim().length === 0) {
    return { valido: false, motivo: 'el estilo está vacío' };
  }
  if (texto.length > MAX_CARACTERES_ESTILO) {
    return { valido: false, motivo: `el estilo supera ${String(MAX_CARACTERES_ESTILO)} caracteres` };
  }
  if (PATRON_PESOS.test(texto)) {
    return { valido: false, motivo: 'el estilo contiene un valor en pesos (R1, R2)' };
  }
  if (PATRON_SKU.test(texto)) {
    return { valido: false, motivo: 'el estilo contiene un SKU (AGT16)' };
  }
  if (PATRON_PLANTILLA.test(texto)) {
    return { valido: false, motivo: 'el estilo contiene un marcador de plantilla {{...}}' };
  }
  return { valido: true };
}
