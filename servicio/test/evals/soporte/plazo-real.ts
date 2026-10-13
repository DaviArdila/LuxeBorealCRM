/**
 * Plazo del turno en la corrida real, en segundos: la corrida lo fija en `LOCK_TURNO_TTL_S` para que el plazo del turno
 * no recorte el timeout del perfil `evals` (D6 de la Fase 07c).
 */
export const PLAZO_TURNO_REAL_S = 60;

/** Margen por caso para crear el contacto, sembrar sus casos de uso y evaluar las aserciones. */
export const MARGEN_CASO_REAL_MS = 30_000;

/**
 * Plazo del `it` de un caso en modo real: cada repetición de cada turno puede agotar dos veces el plazo del turno (el
 * bucle de herramientas y el único reintento de la guarda de dinero, AGT23). Así el plazo nunca corta un caso que
 * todavía puede terminar, y un caso colgado no frena la corrida entera.
 */
export function plazoCasoRealMs({ repeticiones, turnos }: { readonly repeticiones: number; readonly turnos: number }): number {
  return repeticiones * turnos * 2 * PLAZO_TURNO_REAL_S * 1000 + MARGEN_CASO_REAL_MS;
}
