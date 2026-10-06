import { contieneMarcadorDePlantilla, contieneSku, contieneValorEnPesos } from '../../../compartido/texto/index.js';

/** Topes de un caso (CAS5): constantes de código, como el del estilo (ADR-0020); subirlos no invalida nada guardado. */
export const MAX_CARACTERES_TEXTO_CASO = 1200;
export const MAX_CARACTERES_TITULO_CASO = 80;
export const MAX_CARACTERES_CUANDO_APLICA = 200;
/** Un caso del sistema por evento describe cuándo lo envía el código, con más detalle que un «cuándo aplica» de intención. */
export const MAX_CARACTERES_DESCRIPCION_EVENTO = 1000;

export interface DatosCaso {
  readonly titulo: string;
  readonly cuandoAplica: string;
  readonly texto: string;
  readonly modo: 'literal' | 'guia';
  readonly disparador: 'evento' | 'intencion';
  readonly claveSistema: string | null;
}

export type ResultadoValidacionCaso = { readonly valido: true } | { readonly valido: false; readonly motivo: string };

/**
 * Validación pura de un caso antes de guardarlo (CAS5): el texto va al cliente, así que no puede traer dinero (R1, R2),
 * SKU (AGT16) ni marcadores de plantilla; las mismas funciones que valida el estilo. El motivo nombra la regla rota y nunca
 * copia el texto (R14). Un caso del sistema (por evento o con clave) solo admite el modo `literal`: lo envía el código tal
 * cual.
 */
export function validarCaso(caso: DatosCaso): ResultadoValidacionCaso {
  const titulo = caso.titulo.trim();
  if (titulo.length === 0) {
    return { valido: false, motivo: 'el título está vacío' };
  }
  if (titulo.length > MAX_CARACTERES_TITULO_CASO) {
    return { valido: false, motivo: `el título supera ${String(MAX_CARACTERES_TITULO_CASO)} caracteres` };
  }
  const cuandoAplica = caso.cuandoAplica.trim();
  if (cuandoAplica.length === 0) {
    return { valido: false, motivo: 'el «cuándo aplica» está vacío' };
  }
  const tope = caso.disparador === 'evento' ? MAX_CARACTERES_DESCRIPCION_EVENTO : MAX_CARACTERES_CUANDO_APLICA;
  if (cuandoAplica.length > tope) {
    return { valido: false, motivo: `el «cuándo aplica» supera ${String(tope)} caracteres` };
  }
  const texto = caso.texto.trim();
  if (texto.length === 0) {
    return { valido: false, motivo: 'el texto está vacío' };
  }
  if (texto.length > MAX_CARACTERES_TEXTO_CASO) {
    return { valido: false, motivo: `el texto supera ${String(MAX_CARACTERES_TEXTO_CASO)} caracteres` };
  }
  if (contieneValorEnPesos(texto)) {
    return { valido: false, motivo: 'el texto contiene un valor en pesos (R1, R2)' };
  }
  if (contieneSku(texto)) {
    return { valido: false, motivo: 'el texto contiene un SKU (AGT16)' };
  }
  if (contieneMarcadorDePlantilla(texto)) {
    return { valido: false, motivo: 'el texto contiene un marcador de plantilla {{...}}' };
  }
  if (caso.modo === 'guia' && (caso.claveSistema !== null || caso.disparador === 'evento')) {
    return { valido: false, motivo: 'un caso del sistema solo admite el modo literal' };
  }
  return { valido: true };
}
