import { z } from 'zod';

/**
 * Contrato HTTP del webhook (D5, D16 de `design.md`, skill §10, única fuente). El cuerpo solo
 * valida la envoltura (`event`); la traducción real por lista blanca la hace `traducirEvento`
 * (D4, T2) — un cuerpo que no cumple ni esto queda en `ignorado` (CAN3), sin lanzar nunca.
 */
export const esquemaCuerpoWebhookChatwoot = z.looseObject({ event: z.string() });

export type CuerpoWebhookChatwoot = z.infer<typeof esquemaCuerpoWebhookChatwoot>;

/** Respuesta 2xx del webhook (D5): nunca expone el `id` interno de `evento_entrante`. */
export const esquemaRespuestaWebhookChatwoot = z.object({
  estado: z.enum(['registrado', 'duplicado', 'ignorado']),
});

export type RespuestaWebhookChatwoot = z.infer<typeof esquemaRespuestaWebhookChatwoot>;
