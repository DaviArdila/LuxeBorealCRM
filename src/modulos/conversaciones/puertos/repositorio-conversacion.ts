import type { EstadoAtencion, OrigenTransicion } from '../dominio/maquina-estados.js';

/** Token de inyección del puerto {@link RepositorioConversacion} (D2 de `design.md`). */
export const REPOSITORIO_CONVERSACION = Symbol('REPOSITORIO_CONVERSACION');

export interface Conversacion {
  readonly id: string;
  readonly contactoId: string;
  readonly chatwootConversationId: number;
  readonly estado: EstadoAtencion;
  readonly expiraControlEn: Date | null;
  readonly version: number;
}

/**
 * Puerto de acceso a `conversacion` (design.md, "Puertos y adaptadores"; D2). Interno del módulo
 * `conversaciones`: no se exporta en `index.ts`. La implementación llega en T2
 * (`infraestructura/prisma/repositorio-conversacion-prisma.ts`).
 */
export interface RepositorioConversacion {
  /** Nunca busca por teléfono ni otro dato del contacto (P1). */
  obtenerPorConversacionCanal(chatwootConversationId: number): Promise<Conversacion | null>;
  /** Relectura por id (D2): la usa `TransicionarConversacion` al reintentar tras un conflicto de versión. */
  obtenerPorId(id: string): Promise<Conversacion | null>;
  /**
   * Bloqueo optimista (D2): `UPDATE ... WHERE version = $versionLeida`. Cero filas ⇒ conflicto de
   * versión ⇒ el llamador relee y reintenta una vez sobre el estado fresco.
   */
  transicionar(
    id: string,
    versionLeida: number,
    destino: EstadoAtencion,
    origen: OrigenTransicion,
    expiraControlEn: Date | null,
    ahora: Date,
  ): Promise<Conversacion | null>;
  /** `estado IN ('humano','handoff_pendiente') AND expira_control_en <= ahora` (D11). */
  listarVencidas(ahora: Date): Promise<readonly Conversacion[]>;
}
