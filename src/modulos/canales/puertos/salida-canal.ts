/**
 * Puerto de canal de salida (design.md D9, CAN6): quien lo invoca expresa el efecto en tipos
 * propios del dominio ("enviar estos mensajes a esta conversación", "cambiar su estado",
 * "etiquetarla"), sin conocer el formato de la API de Chatwoot (A9) ni si el efecto ya llegó al
 * cliente. Lo implementa `SalidaCanalOutbox` (`aplicacion/`, T7), que encola en
 * `plataforma/outbox` en vez de llamar HTTP directamente — este archivo solo declara el contrato.
 *
 * Se exporta desde el barril de `canales` (`index.ts`, D9): la Fase 05 lo consume desde
 * `conversaciones/salida`, que le agrega la relectura del estado de la FSM antes de cada envío.
 * Hasta entonces el único consumidor es el test. `ADAPTADOR_CANAL` (`adaptador-canal.ts`), en
 * cambio, es interno: nadie fuera de `canales` puede saltarse el outbox para mandar un mensaje.
 */
import type { EstadoConversacionCanal } from '../dominio/evento-canal.js';

/** Token de inyección del puerto {@link SalidaCanal}. */
export const SALIDA_CANAL = Symbol('SALIDA_CANAL');

/** Mensaje saliente propio del dominio; `'imagen'` y los demás tipos llegan en la Fase 07. */
export type MensajeSaliente = { readonly tipo: 'texto'; readonly texto: string };

/**
 * `idRespuesta` MUST ser estable entre reintentos de quien llama (D11): identifica una secuencia
 * inmutable de hasta {@link MAX_PASOS_SECUENCIA} pasos ante la clave de idempotencia del outbox.
 * `requiereEstado` es opaco para `canales` (CAN9): si viene, cada paso solo se publica cuando la
 * guardia registrada por el módulo que encola confirma que sigue en ese estado.
 */
export interface SolicitudEnvioMensajes {
  readonly idConversacion: string;
  readonly idRespuesta: string;
  readonly requiereEstado?: string;
  readonly mensajes: readonly MensajeSaliente[];
}

export interface SolicitudCambioEstado {
  readonly idConversacion: string;
  readonly idOperacion: string;
  readonly estado: Exclude<EstadoConversacionCanal, 'pospuesta'>;
}

export interface SolicitudEtiquetas {
  readonly idConversacion: string;
  readonly idOperacion: string;
  readonly etiquetas: readonly string[];
}

/**
 * Cada método resuelve cuando el efecto quedó durable en el outbox (D9, D10), no cuando llegó al
 * cliente: el reintento y el orden por conversación los decide el publicador del outbox (D10),
 * nunca quien invoca este puerto.
 */
export interface SalidaCanal {
  enviarMensajes(solicitud: SolicitudEnvioMensajes): Promise<void>;
  cambiarEstado(solicitud: SolicitudCambioEstado): Promise<void>;
  agregarEtiquetas(solicitud: SolicitudEtiquetas): Promise<void>;
}
