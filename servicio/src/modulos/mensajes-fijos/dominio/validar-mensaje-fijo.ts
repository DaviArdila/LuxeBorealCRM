import { contieneMarcadorDePlantilla, contieneValorEnPesos } from '../../../compartido/texto/index.js';

/**
 * Tope de un mensaje fijo (CFN2, P56): atrapa un descuido sin limitar un mensaje corto de WhatsApp. Es una constante de
 * código, como el del estilo (ADR-0020); subirlo después no invalida ningún texto guardado.
 */
export const MAX_CARACTERES_MENSAJE_FIJO = 1000;

export type ResultadoValidacionMensajeFijo =
  | { readonly valido: true }
  | { readonly valido: false; readonly motivo: string };

/**
 * Validación pura de un mensaje fijo antes de guardarlo (CFN2, Q2): no vacío, hasta 1.000 caracteres, sin valores en
 * pesos (R1, R2: el dinero sale solo del backend) y sin marcadores `{{...}}` (nadie los reemplazaría). El motivo nombra
 * la regla rota y nunca copia el texto (R14).
 */
export function validarMensajeFijo(texto: string): ResultadoValidacionMensajeFijo {
  if (texto.trim().length === 0) {
    return { valido: false, motivo: 'el mensaje está vacío' };
  }
  if (texto.length > MAX_CARACTERES_MENSAJE_FIJO) {
    return { valido: false, motivo: `el mensaje supera ${String(MAX_CARACTERES_MENSAJE_FIJO)} caracteres` };
  }
  if (contieneValorEnPesos(texto)) {
    return { valido: false, motivo: 'el mensaje contiene un valor en pesos (R1, R2)' };
  }
  if (contieneMarcadorDePlantilla(texto)) {
    return { valido: false, motivo: 'el mensaje contiene un marcador de plantilla {{...}}' };
  }
  return { valido: true };
}
