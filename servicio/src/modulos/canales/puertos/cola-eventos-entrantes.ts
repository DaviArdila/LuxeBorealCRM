/** Token de inyección del puerto {@link ColaEventosEntrantes} (D5, D6 de `design.md`). */
export const COLA_EVENTOS_ENTRANTES = Symbol('COLA_EVENTOS_ENTRANTES');

/**
 * Puerto de disparo del procesador del inbox (design.md, "Puertos y adaptadores"; D5). Interno del
 * módulo `canales`: no se exporta en `index.ts`. En esta tarea (T3) se registra un doble que no
 * encola de verdad (`ColaEventosEntrantesDoble`); T4 lo sustituye por
 * `ColaEventosEntrantesBullmq` con `jobId = id` sobre BullMQ, sin que `RegistrarEventoEntrante`
 * (D5) cambie: siempre llama a `encolar(id)` con un tope de 200 ms (`Promise.race`) y solo loguea
 * si falla o tarda, nunca lanza.
 */
export interface ColaEventosEntrantes {
  encolar(id: string): Promise<void>;
}
