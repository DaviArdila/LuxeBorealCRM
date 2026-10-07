import { contieneMarcadorDePlantilla, contieneSku, contieneValorEnPesos } from '../../../compartido/texto/index.js';

/**
 * Validación pura del estilo del agente antes de publicarlo (AGT20, D4 de la Fase 08c). El estilo viaja en
 * todos los mensajes y no puede traer dinero (R1, R2), SKU (AGT16) ni marcadores de la plantilla del turno.
 * El tope de caracteres es una constante de código (ADR-0020): atrapa un descuido y evita que el estilo
 * compita con las reglas; subirlo después no invalida nada.
 */
export const MAX_CARACTERES_ESTILO = 4000;

/** Largo máximo del título de una sección (EST-S2). */
export const MAX_CARACTERES_TITULO_SECCION = 100;

export type ResultadoValidacionEstilo = { readonly valido: true } | { readonly valido: false; readonly motivo: string };

/** El motivo nombra la regla rota, nunca copia el texto (R14). */
export function validarEstilo(texto: string): ResultadoValidacionEstilo {
  if (texto.trim().length === 0) {
    return { valido: false, motivo: 'el estilo está vacío' };
  }
  if (texto.length > MAX_CARACTERES_ESTILO) {
    return { valido: false, motivo: `el estilo supera ${String(MAX_CARACTERES_ESTILO)} caracteres` };
  }
  return reglasDeContenido(texto, 'el estilo');
}

/** Una sección del estilo tal como la escribe el admin (EST-S2). */
export interface SeccionEscrita {
  readonly titulo: string;
  readonly texto: string;
}

/**
 * Validación de una sección antes de guardarla (EST-S2): título de una línea y texto con contenido, sin encabezados
 * `# ` que la partirían al componer, y con las mismas reglas de contenido que el estilo entero. El tope de
 * caracteres no es por sección: rige sobre el compuesto (`validarEstilo`). El motivo nunca copia el texto (R14).
 */
export function validarSeccionEstilo(seccion: SeccionEscrita): ResultadoValidacionEstilo {
  const titulo = seccion.titulo.trim();
  if (titulo.length === 0 || titulo.includes('\n')) {
    return { valido: false, motivo: 'el título de la sección está vacío o tiene más de una línea' };
  }
  if (titulo.length > MAX_CARACTERES_TITULO_SECCION) {
    return { valido: false, motivo: `el título de la sección supera ${String(MAX_CARACTERES_TITULO_SECCION)} caracteres` };
  }
  if (seccion.texto.trim().length === 0) {
    return { valido: false, motivo: 'el texto de la sección está vacío' };
  }
  if (/^# /m.test(seccion.texto)) {
    return { valido: false, motivo: 'el texto de la sección contiene un encabezado «# » que la partiría' };
  }
  return reglasDeContenido(`${titulo}\n${seccion.texto}`, 'la sección');
}

function reglasDeContenido(texto: string, sujeto: string): ResultadoValidacionEstilo {
  if (contieneValorEnPesos(texto)) {
    return { valido: false, motivo: `${sujeto} contiene un valor en pesos (R1, R2)` };
  }
  if (contieneSku(texto)) {
    return { valido: false, motivo: `${sujeto} contiene un SKU (AGT16)` };
  }
  if (contieneMarcadorDePlantilla(texto)) {
    return { valido: false, motivo: `${sujeto} contiene un marcador de plantilla {{...}}` };
  }
  return { valido: true };
}
