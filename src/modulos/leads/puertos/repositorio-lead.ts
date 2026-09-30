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
}
