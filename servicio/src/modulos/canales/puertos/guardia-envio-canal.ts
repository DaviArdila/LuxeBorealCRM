/**
 * Guardia de envío por paso (CAN9, D7 de la 07a): `canales` la consulta justo antes de publicar
 * cada mensaje que declara un estado requerido, sin saber qué significa ese estado. La registra el
 * módulo que encola los mensajes (`conversaciones`) en `RegistroGuardiaEnvioCanal`.
 */
export interface GuardiaEnvioCanal {
  /** `true` si la conversación sigue en el estado que el mensaje requiere. */
  puedeEnviar(idConversacion: string, requiereEstado: string): Promise<boolean>;
}
