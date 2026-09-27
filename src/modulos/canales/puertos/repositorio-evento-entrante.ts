import type { EventoCanal } from '../dominio/evento-canal.js';

/** Token de inyección del puerto {@link RepositorioEventoEntrante} (D5, D7 de `design.md`). */
export const REPOSITORIO_EVENTO_ENTRANTE = Symbol('REPOSITORIO_EVENTO_ENTRANTE');

/**
 * `nuevo` cuando `registrar` insertó una fila (queda su `id` para encolarla); `duplicado` cuando
 * `(origen, idExterno)` ya existía (`P2002`, R4) — el llamador no vuelve a encolar ni a lanzar.
 */
export type ResultadoRegistro =
  | { readonly resultado: 'nuevo'; readonly id: string }
  | { readonly resultado: 'duplicado' };

export interface NuevoEventoEntrante {
  readonly origen: string;
  readonly idExterno: string;
  readonly payload: EventoCanal;
}

/**
 * Puerto de acceso a `evento_entrante` (design.md, "Puertos y adaptadores"; D5, D7). Interno del
 * módulo `canales`: no se exporta en `index.ts` (`aplicacion/` es el único consumidor).
 */
export interface RepositorioEventoEntrante {
  registrar(evento: NuevoEventoEntrante): Promise<ResultadoRegistro>;
  /**
   * `UPDATE ... SET intentos = intentos + 1 WHERE id = $1 AND procesado_en IS NULL AND error IS
   * NULL RETURNING payload` (D7): `null` cuando la fila ya está procesada o muerta (idempotente
   * frente a jobs duplicados o *stalled*, T4).
   */
  iniciarIntento(id: string): Promise<EventoCanal | null>;
  marcarProcesado(id: string, ahora: Date): Promise<void>;
  marcarMuerto(id: string, error: string): Promise<void>;
  listarPendientesAntesDe(limite: Date, maximo: number): Promise<readonly string[]>;
}
