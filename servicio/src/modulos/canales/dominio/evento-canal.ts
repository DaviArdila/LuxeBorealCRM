/**
 * Tipo propio del dominio de `canales` para un evento ya traducido de cualquier proveedor
 * (`design.md` D1, D4). El dominio no conoce el formato de Chatwoot (A9): quien construye este
 * tipo es `infraestructura/chatwoot/traducir-evento.ts` (T2), a partir de una lista blanca de
 * campos — nunca el texto del mensaje, adjuntos, teléfono completo ni otro dato personal (R14,
 * CAN5). Este archivo no importa nada (regla `dominio-aislado`): solo declara tipos.
 */

/** Mismos valores que el enum `canal_conversacion` ya migrado (`schema.prisma`, Fase 01). */
export type CanalOrigen = 'whatsapp' | 'instagram' | 'messenger' | 'web' | 'otro';

/** Tipo del primer adjunto de un mensaje entrante, nunca su contenido (CAN5). */
export type TipoContenido = 'texto' | 'imagen' | 'audio' | 'ubicacion' | 'documento' | 'sticker' | 'otro';

/** Estado de una conversación en el proveedor de canal (D4, D9). */
export type EstadoConversacionCanal = 'abierta' | 'pendiente' | 'resuelta' | 'pospuesta';

/**
 * Identidad de la conversación por sí misma, no por el teléfono del contacto (P1). `idExterno` y
 * `idContactoExterno` son ids del proveedor, nunca datos personales; `canalProveedor` es el valor
 * crudo de `conversation.channel` (trazabilidad), `canal` es su traducción (D14).
 */
export interface ReferenciaConversacion {
  readonly idExterno: string;
  readonly idContactoExterno: string | null;
  readonly canal: CanalOrigen;
  readonly canalProveedor: string | null;
}

interface BaseEvento {
  readonly v: 1;
  readonly eventoProveedor: string;
  readonly conversacion: ReferenciaConversacion;
}

/**
 * Evento normalizado que se guarda en `evento_entrante.payload` y que recibe el consumidor
 * (D4). Unión discriminada por `tipo`; ninguna variante trae texto, adjuntos ni datos personales.
 */
export type EventoCanal =
  | (BaseEvento & {
      readonly tipo: 'mensaje-entrante';
      readonly idMensaje: string;
      readonly tipoContenido: TipoContenido;
    })
  | (BaseEvento & { readonly tipo: 'mensaje-humano'; readonly idMensaje: string })
  | (BaseEvento & { readonly tipo: 'estado-conversacion'; readonly estado: EstadoConversacionCanal });
