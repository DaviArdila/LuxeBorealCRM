import type { ClaveSistema, TextosAsistente } from '../../src/modulos/asistente/index.js';

/**
 * Doble de test de {@link TextosAsistente}: devuelve el texto configurado o, si no lo hay, un marcador `[<clave>]` que deja
 * ver de qué clave salió cada respuesta (el respaldo real se prueba contra el proveedor y la base).
 */
export class TextosAsistenteEnMemoria implements TextosAsistente {
  readonly textos = new Map<ClaveSistema, string>();

  textoDelSistema(clave: ClaveSistema): Promise<string> {
    return Promise.resolve(this.textos.get(clave) ?? `[${clave}]`);
  }
}
