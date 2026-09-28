import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { LectorMensajeCanal } from '../../puertos/lector-mensaje-canal.js';
import { ClienteChatwoot } from './cliente-chatwoot.js';

const mensajeSchema = z.looseObject({
  id: z.number().optional(),
  content: z.string().nullable().optional(),
});
const respuestaMensajesSchema = z.looseObject({ payload: z.array(mensajeSchema).optional() });

/**
 * Adaptador Chatwoot del puerto {@link LectorMensajeCanal} (D16 de la Fase 05): mismo endpoint que
 * ya usa `AdaptadorCanalChatwoot.existeMensajeConMarca` (`GET .../messages`), filtrado por `id`.
 * `null` ante una respuesta con forma inesperada o si el mensaje ya no aparece — nunca lanza.
 */
@Injectable()
export class LectorMensajeCanalChatwoot implements LectorMensajeCanal {
  constructor(private readonly cliente: ClienteChatwoot) {}

  async obtenerTexto(idConversacion: string, idMensaje: string): Promise<string | null> {
    let respuesta: unknown;
    try {
      respuesta = await this.cliente.get(idConversacion, 'messages');
    } catch {
      // `ClienteChatwoot.llamar` lanza `FalloCanal` ante timeout/red/HTTP 5xx/429; el contrato del
      // puerto (`LectorMensajeCanal`) promete "nunca lanza", así que una falla transitoria de
      // Chatwoot se trata igual que una respuesta con forma inesperada: null.
      return null;
    }
    const analizada = respuestaMensajesSchema.safeParse(respuesta);
    if (!analizada.success) return null;

    const mensaje = (analizada.data.payload ?? []).find((item) => String(item.id) === idMensaje);
    return mensaje?.content ?? null;
  }
}
