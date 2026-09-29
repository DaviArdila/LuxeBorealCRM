import type {
  ClaveTextoAgente,
  RepositorioParametroAgente,
} from '../../src/modulos/agente/puertos/repositorio-parametro-agente.js';

/**
 * Doble de test de {@link RepositorioParametroAgente}: devuelve el texto configurado o, si no lo hay,
 * un marcador `[<clave>]` que deja ver de qué clave salió cada respuesta (el respaldo real se prueba
 * contra el adaptador Prisma).
 */
export class RepositorioParametroAgenteEnMemoria implements RepositorioParametroAgente {
  readonly textos = new Map<ClaveTextoAgente, string>();

  obtenerTexto(clave: ClaveTextoAgente): Promise<string> {
    return Promise.resolve(this.textos.get(clave) ?? `[${clave}]`);
  }
}
