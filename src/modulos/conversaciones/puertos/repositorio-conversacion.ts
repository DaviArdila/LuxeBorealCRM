import type { EstadoAtencion, OrigenTransicion } from '../dominio/maquina-estados.js';

/** Token de inyección del puerto {@link RepositorioConversacion} (D2 de `design.md`). */
export const REPOSITORIO_CONVERSACION = Symbol('REPOSITORIO_CONVERSACION');

/** Mismos valores que el enum `canal_conversacion` de Prisma, sin importarlo (dominio-aislado). */
export type CanalConversacion = 'whatsapp' | 'instagram' | 'messenger' | 'web' | 'otro';

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
   * `ObtenerOCrearConversacion` (D5): si ya existe una fila para `chatwootConversationId`, la
   * devuelve; si no, crea el `Contacto` (upsert por `chatwootContactId` cuando `idContactoExterno`
   * no es `null`; si es `null`, un contacto nuevo sin vínculo externo) y la `Conversacion` en
   * `bot`. Desviación anotada en `sdd-apply` (T5): `design.md` D2 asumía un `REPOSITORIO_CONTACTO`
   * ya resuelto por la Fase 01/04 — no existe en el repositorio; esta operación resuelve el
   * contacto por sí misma, sin necesitar un puerto propio de `contactos` (no hay otro consumidor
   * hoy que lo justifique, regla 2 de `docs/fases/README.md`).
   */
  obtenerOCrear(
    chatwootConversationId: number,
    idContactoExterno: string | null,
    canal: CanalConversacion,
  ): Promise<Conversacion>;
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
