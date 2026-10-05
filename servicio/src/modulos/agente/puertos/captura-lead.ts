/** Token de inyección del puerto {@link CapturaLead}. */
export const CAPTURA_LEAD = Symbol('CAPTURA_LEAD');

/**
 * Captura de datos de un lead fuera de horario (D5 de la Fase 08, R10, LDS4), vista desde el agente:
 * `pendiente` dice si el bot debe pedir los datos en este turno y `completar` cierra la captura cuando
 * `guardar_datos_contacto` ya los guardó. La implementa un adaptador sobre el módulo `leads`.
 */
export interface CapturaLead {
  pendiente(conversacionId: string): Promise<boolean>;
  completar(conversacionId: string): Promise<void>;
}
