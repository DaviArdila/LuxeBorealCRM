export interface EntradaEnlaceConversacion {
  /** `CHATWOOT_URL_PUBLICA`: la URL por la que el asesor abre Chatwoot desde su celular. */
  readonly urlPublica?: string | undefined;
  /** `CHATWOOT_URL`: respaldo cuando no hay URL pública. */
  readonly urlChatwoot: string;
  readonly cuenta: number;
  /** Identificador de la conversación en Chatwoot; `null` o ausente si la conversación no lo tiene. */
  readonly idChatwoot: number | null | undefined;
}

/**
 * Arma el enlace que abre una conversación en Chatwoot (NTF5, D1 de la Fase 08d). Función pura: la base es la URL
 * pública o, si falta o está vacía, la de Chatwoot; se le quitan las barras finales para no duplicarlas. Contiene
 * solo ids numéricos, nunca datos del cliente (R14). Devuelve `null` si la conversación no tiene identificador
 * de Chatwoot: el aviso sale igual, sin enlace.
 */
export function construirEnlaceConversacion(entrada: EntradaEnlaceConversacion): string | null {
  if (entrada.idChatwoot === null || entrada.idChatwoot === undefined) {
    return null;
  }
  const publica = entrada.urlPublica?.trim() ?? '';
  const base = (publica.length > 0 ? publica : entrada.urlChatwoot.trim()).replace(/\/+$/, '');
  return `${base}/app/accounts/${entrada.cuenta}/conversations/${entrada.idChatwoot}`;
}
