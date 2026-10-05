/**
 * Traducción y redacción por lista blanca del payload de Chatwoot a `EventoCanal` (D4, CAN3, CAN5,
 * R14), portada de `../ChatLuxeCRM/src/webhook/parseEvent.ts`. Solo sobreviven los campos que
 * `EventoCanal` declara: nunca el texto del mensaje, adjuntos, coordenadas, teléfono completo,
 * `identifier`, `name`, `email`, ni el `source_id` del mensaje o del `contact_inbox` (el `wamid` de
 * Meta codifica el teléfono del destinatario, así que tampoco entra). Vive en `infraestructura/`
 * porque usa `zod` y habla el formato de Chatwoot (D1, regla `dominio-aislado`).
 */
import { z } from 'zod';
import type { EstadoConversacionCanal, EventoCanal, TipoContenido } from '../../dominio/evento-canal.js';
import { canalDesdeChatwoot } from './canal-desde-chatwoot.js';

const contactInboxSchema = z.looseObject({
  contact_id: z.number().nullable().optional(),
  source_id: z.string().nullable().optional(),
});

const remitenteSchema = z.looseObject({
  type: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});

const adjuntoSchema = z.looseObject({
  file_type: z.string().nullable().optional(),
});

const conversacionSchema = z.looseObject({
  id: z.number(),
  channel: z.string().nullable().optional(),
  contact_inbox: contactInboxSchema.nullable().optional(),
});

/**
 * Envoltura holgada (`z.looseObject`, D4): valida solo los campos que la traducción necesita.
 * `message_created` trae `conversation.{id,channel,contact_inbox}`; `conversation_status_changed`
 * trae esos mismos campos (`id`, `channel`/`status`, `contact_inbox`) en la **raíz** del payload,
 * no anidados — Chatwoot no envuelve ese evento en un objeto `conversation` (confirmado con los
 * fixtures reales de T1).
 */
const eventoChatwootSchema = z.looseObject({
  event: z.string(),
  id: z.number().nullable().optional(),
  message_type: z.union([z.string(), z.number()]).nullable().optional(),
  private: z.boolean().nullable().optional(),
  conversation: conversacionSchema.nullable().optional(),
  sender: remitenteSchema.nullable().optional(),
  attachments: z.array(adjuntoSchema).nullable().optional(),
  status: z.string().nullable().optional(),
  channel: z.string().nullable().optional(),
  contact_inbox: contactInboxSchema.nullable().optional(),
});

type EventoChatwoot = z.infer<typeof eventoChatwootSchema>;

/** Cabeceras que `traducirEvento` puede necesitar para construir el `id_externo` de dedupe (D4). */
export interface CabecerasTraducirEvento {
  readonly xChatwootDelivery?: string;
  readonly xChatwootTimestamp?: string;
}

/**
 * `idExterno` es la clave de dedupe de `evento_entrante` (D4, D5: `UNIQUE(origen, id_externo)`),
 * distinta de `evento.conversacion.idExterno` (el id de la conversación en el proveedor).
 */
export type ResultadoTraducirEvento =
  | { readonly reconocido: true; readonly idExterno: string; readonly evento: EventoCanal }
  | { readonly reconocido: false };

const IGNORADO: ResultadoTraducirEvento = { reconocido: false };

/** Tipo del primer adjunto de un mensaje entrante, nunca su contenido (CAN5, D4). */
const TIPOS_ADJUNTO: Readonly<Record<string, TipoContenido>> = {
  image: 'imagen',
  audio: 'audio',
  video: 'imagen',
  location: 'ubicacion',
  file: 'documento',
  sticker: 'sticker',
};

/** `status` de Chatwoot → {@link EstadoConversacionCanal} (D4). Un valor sin mapeo se ignora (CAN3). */
const ESTADOS_CHATWOOT: Readonly<Record<string, EstadoConversacionCanal>> = {
  open: 'abierta',
  pending: 'pendiente',
  resolved: 'resuelta',
  snoozed: 'pospuesta',
};

/**
 * Los mensajes salientes de un asesor traen `sender.type: 'user'`; los del bot vienen sin sender
 * humano (`agent_bot`/`agentbot`/`contact`, o sin `type`). Cualquier cosa que no sea claramente un
 * humano no cuenta como eco (porta `esRemitenteHumano` del prototipo), para no cederle el control
 * al humano por un mensaje del propio bot (D4).
 */
function esRemitenteHumano(sender: z.infer<typeof remitenteSchema> | null | undefined): boolean {
  if (!sender) return false;
  const tipo = (sender.type ?? '').toLowerCase();
  if (tipo === 'agent_bot' || tipo === 'agentbot' || tipo === 'contact') return false;
  if (tipo === 'user') return true;
  return Boolean(sender.email);
}

/** Acepta tanto la forma de texto (`'incoming'`/`'outgoing'`) como la numérica (`0`/`1`, D4). */
function normalizarTipoMensaje(valor: string | number | null | undefined): 'incoming' | 'outgoing' | undefined {
  if (valor === 'incoming' || valor === 0) return 'incoming';
  if (valor === 'outgoing' || valor === 1) return 'outgoing';
  return undefined;
}

function idContactoDesde(contactInbox: z.infer<typeof contactInboxSchema> | null | undefined): string | null {
  return contactInbox?.contact_id != null ? String(contactInbox.contact_id) : null;
}

/**
 * D4: `message_created` incoming/outgoing humano → `EventoCanal`; outgoing del bot, nota privada
 * (`private: true`, hallazgo real de T1: Chatwoot sí dispara el webhook para notas privadas),
 * cualquier otro `message_type`, o sin conversación → ignorado. `conversation_status_changed` con
 * `status` e `id` en la raíz → `EventoCanal`. Cualquier otro evento, o un payload que no cumple el
 * esquema mínimo → ignorado (CAN3), sin lanzar nunca.
 */
export function traducirEvento(json: unknown, cabeceras: CabecerasTraducirEvento = {}): ResultadoTraducirEvento {
  const resultado = eventoChatwootSchema.safeParse(json);
  if (!resultado.success) return IGNORADO;
  const ev = resultado.data;

  if (ev.event === 'message_created') return traducirMensajeCreado(ev);
  if (ev.event === 'conversation_status_changed') return traducirCambioEstado(ev, cabeceras);
  return IGNORADO;
}

function traducirMensajeCreado(ev: EventoChatwoot): ResultadoTraducirEvento {
  if (ev.id == null || !ev.conversation) return IGNORADO;
  if (ev.private) return IGNORADO;

  const tipoMensaje = normalizarTipoMensaje(ev.message_type);
  const idMensaje = String(ev.id);
  const conversacion = {
    idExterno: String(ev.conversation.id),
    idContactoExterno: idContactoDesde(ev.conversation.contact_inbox),
    canal: canalDesdeChatwoot(ev.conversation.channel),
    canalProveedor: ev.conversation.channel ?? null,
  };

  if (tipoMensaje === 'incoming') {
    const tipoAdjuntoCrudo = ev.attachments?.[0]?.file_type ?? undefined;
    const tipoContenido: TipoContenido = tipoAdjuntoCrudo ? TIPOS_ADJUNTO[tipoAdjuntoCrudo] ?? 'otro' : 'texto';
    return {
      reconocido: true,
      idExterno: `mensaje:${idMensaje}`,
      evento: { v: 1, eventoProveedor: ev.event, conversacion, tipo: 'mensaje-entrante', idMensaje, tipoContenido },
    };
  }

  if (tipoMensaje === 'outgoing' && esRemitenteHumano(ev.sender)) {
    return {
      reconocido: true,
      idExterno: `mensaje:${idMensaje}`,
      evento: { v: 1, eventoProveedor: ev.event, conversacion, tipo: 'mensaje-humano', idMensaje },
    };
  }

  // outgoing del bot, o un message_type sin reconocer: ignorado (D4).
  return IGNORADO;
}

function traducirCambioEstado(ev: EventoChatwoot, cabeceras: CabecerasTraducirEvento): ResultadoTraducirEvento {
  if (ev.id == null || !ev.status) return IGNORADO;

  const estado = ESTADOS_CHATWOOT[ev.status];
  if (!estado) return IGNORADO;

  const idConversacion = String(ev.id);
  const marcaDedupe = cabeceras.xChatwootDelivery ?? cabeceras.xChatwootTimestamp ?? '';

  return {
    reconocido: true,
    idExterno: `estado:${idConversacion}:${ev.status}:${marcaDedupe}`,
    evento: {
      v: 1,
      eventoProveedor: ev.event,
      conversacion: {
        idExterno: idConversacion,
        idContactoExterno: idContactoDesde(ev.contact_inbox),
        canal: canalDesdeChatwoot(ev.channel),
        canalProveedor: ev.channel ?? null,
      },
      tipo: 'estado-conversacion',
      estado,
    },
  };
}
