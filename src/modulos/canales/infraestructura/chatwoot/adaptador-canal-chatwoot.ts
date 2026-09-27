/**
 * Adaptador Chatwoot del puerto `AdaptadorCanal` (D9, D12, D13, D15 de `design.md`; CAN6). Traduce
 * cada operación en tipos propios del dominio a la llamada HTTP correspondiente vía
 * {@link ClienteChatwoot}: `enviarTexto` → `POST .../messages`, `cambiarEstado` →
 * `POST .../toggle_status`, `agregarEtiquetas` → `GET .../labels` + unión + `POST .../labels`
 * (D15: nunca reemplaza el conjunto existente). `existeMensajeConMarca` es la reconciliación de D13
 * (confirmada contra Chatwoot v4.17.1 real por T1: `content_attributes` se persiste y vuelve en el
 * `GET`, pero Chatwoot no deduplica por ese campo — la reconciliación la hace este adaptador).
 * No se registra en `canales.module.ts` en esta tarea: solo el manejador del outbox lo invoca
 * (T7, D9); `ADAPTADOR_CANAL` no se exporta del barril del módulo.
 */
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { EstadoConversacionCanal } from '../../dominio/evento-canal.js';
import type { AdaptadorCanal } from '../../puertos/adaptador-canal.js';
import { ClienteChatwoot } from './cliente-chatwoot.js';

/** `EstadoConversacionCanal` propio → `status` de Chatwoot (inverso de `ESTADOS_CHATWOOT` de `traducir-evento.ts`). */
const ESTADOS_A_CHATWOOT: Readonly<Record<Exclude<EstadoConversacionCanal, 'pospuesta'>, string>> = {
  abierta: 'open',
  pendiente: 'pending',
  resuelta: 'resolved',
};

const mensajeChatwootSchema = z.looseObject({
  content_attributes: z.looseObject({ luxe_clave: z.string().optional() }).nullable().optional(),
});

const respuestaMensajesSchema = z.looseObject({
  payload: z.array(mensajeChatwootSchema).optional(),
});

const respuestaEtiquetasSchema = z.looseObject({
  payload: z.array(z.string()).optional(),
});

@Injectable()
export class AdaptadorCanalChatwoot implements AdaptadorCanal {
  constructor(private readonly cliente: ClienteChatwoot) {}

  async enviarTexto(idConversacion: string, texto: string, marca: string): Promise<void> {
    await this.cliente.post(idConversacion, 'messages', {
      message_type: 'outgoing',
      content: texto,
      content_attributes: { luxe_clave: marca },
    });
  }

  async existeMensajeConMarca(idConversacion: string, marca: string): Promise<boolean> {
    const respuesta = await this.cliente.get(idConversacion, 'messages');
    const analizada = respuestaMensajesSchema.safeParse(respuesta);
    if (!analizada.success) return false;
    return (analizada.data.payload ?? []).some(
      (mensaje) => mensaje.content_attributes?.luxe_clave === marca,
    );
  }

  async cambiarEstado(idConversacion: string, estado: Exclude<EstadoConversacionCanal, 'pospuesta'>): Promise<void> {
    await this.cliente.post(idConversacion, 'toggle_status', { status: ESTADOS_A_CHATWOOT[estado] });
  }

  async agregarEtiquetas(idConversacion: string, etiquetas: readonly string[]): Promise<void> {
    const actuales = await this.obtenerEtiquetas(idConversacion);
    // D15: unión, nunca reemplazo — las etiquetas que un asesor haya puesto en Chatwoot sobreviven.
    const union = Array.from(new Set([...actuales, ...etiquetas]));
    await this.cliente.post(idConversacion, 'labels', { labels: union });
  }

  private async obtenerEtiquetas(idConversacion: string): Promise<readonly string[]> {
    const respuesta = await this.cliente.get(idConversacion, 'labels');
    const analizada = respuestaEtiquetasSchema.safeParse(respuesta);
    return analizada.success ? analizada.data.payload ?? [] : [];
  }
}
