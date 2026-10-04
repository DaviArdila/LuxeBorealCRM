import type { CambiosLead, Lead, NuevoLead } from '../dominio/lead.js';

/** Token de inyección del puerto {@link RepositorioLead}. */
export const REPOSITORIO_LEAD = Symbol('REPOSITORIO_LEAD');

/**
 * Único acceso a la tabla `lead` (Prisma por módulo). «Un lead abierto por conversación» (LDS2) lo
 * garantiza el lock del turno, que serializa los turnos de una conversación (R8): no hace falta una
 * restricción única ni una migración.
 */
export interface RepositorioLead {
  /** El lead de la conversación que sigue en estado `nuevo`, o `null`. */
  obtenerAbiertoDeConversacion(conversacionId: string): Promise<Lead | null>;
  crear(nuevo: NuevoLead): Promise<Lead>;
  actualizar(id: string, cambios: CambiosLead): Promise<Lead>;
  /**
   * Fija `notificado_en = ahora` en el lead solo si ningún lead del mismo contacto tiene `notificado_en`
   * posterior a `limite` (NTF2, D8). Comprobación y marca son atómicas: dos llamadas simultáneas para el
   * mismo contacto devuelven `true` una sola vez. `false` = ya se avisó dentro de la ventana.
   */
  marcarNotificado(lead: { id: string; contactoId: string }, ahora: Date, limite: Date): Promise<boolean>;
  /** Deshace {@link marcarNotificado} cuando el aviso no pudo encolarse: mejor perder la marca que el aviso. */
  desmarcarNotificado(id: string): Promise<void>;
  /**
   * Reclama, marcando `recordatorio_en = ahora`, los leads derivados y avisados antes de `limite` que
   * siguen en `nuevo` y no se recordaron (LDS5, D10). El reclamo es atómico: dos barridos simultáneos no
   * reclaman el mismo lead. Devuelve como máximo `maximo` leads.
   */
  reclamarSinAtender(limite: Date, ahora: Date, maximo: number): Promise<Lead[]>;
  /** Deshace el reclamo cuando el recordatorio no pudo encolarse: el próximo barrido lo reintenta. */
  desmarcarRecordatorio(id: string): Promise<void>;
}
